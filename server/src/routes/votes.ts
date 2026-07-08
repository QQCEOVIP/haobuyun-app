import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';
import { isValidPhone, normalizePhone } from '../middleware/rate-limit';

const router: any = Router();

// 阈值配置（基于不同用户数）
// >=3 个不同用户投"失效" → 确认停机
// >=1 个用户投"失效" → 疑似停机
const CONFIRMED_THRESHOLD = 3;
const MAYBE_THRESHOLD = 1;

function getUserIdFromHeaders(req: any): string | null {
  const userId = req.headers['x-user-id'];
  if (userId) return userId as string;
  const session = req.headers['x-session'];
  if (session) {
    try { return session as string; } catch (e) { return null; }
  }
  return null;
}

function requireAuth(req: any, res: any, next: any) {
  const userId = getUserIdFromHeaders(req);
  if (!userId) return res.status(401).json({ error: '请先登录' });
  (req as any).userId = userId;
  next();
}

/**
 * 提交/更新投票
 * POST /api/v1/votes
 * Body: { phone: string, vote: 'stopped' | 'valid' }
 * 
 * 安全规则：
 * - 手机号格式校验
 * - 单用户 1 分钟内最多 10 票（防刷）
 * - 同一用户对同一号码只能投一次（UPSERT 覆盖）
 */
router.post('/', requireAuth, async (req: any, res: any) => {
  try {
    const { phone, vote } = req.body;
    const userId = req.userId;

    if (!phone || !vote) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '手机号格式无效' });
    }

    if (!['stopped', 'valid'].includes(vote)) {
      return res.status(400).json({ error: '无效的投票类型' });
    }

    const normalizedPhone = normalizePhone(phone);

    // 防刷检查：1 分钟内最多 10 票
    try {
      const rateCheck = await db.execute(sql`
        SELECT COUNT(*)::int as recent_count
        FROM number_votes
        WHERE user_id = ${userId}
          AND voted_at > NOW() - INTERVAL '1 minute'
      `);
      const recentCount = (rateCheck as any[])?.[0]?.recent_count || 0;
      if (recentCount >= 10) {
        return res.status(429).json({ error: '投票过于频繁，每分钟最多 10 次', retry_after: 60 });
      }
    } catch (err: any) {
      if (err?.code !== '42P01') throw err; // 表不存在则跳过
    }

    // UPSERT 投票记录
    const result = await db.execute(sql`
      INSERT INTO number_votes (phone, user_id, vote, voted_at)
      VALUES (${normalizedPhone}, ${userId}, ${vote}, NOW())
      ON CONFLICT (phone, user_id) 
      DO UPDATE SET vote = ${vote}, voted_at = NOW()
      RETURNING id, phone, user_id, vote, voted_at
    `);

    res.json({ success: true, data: (result as any[])?.[0] || null });
  } catch (error) {
    console.error('Vote submit error:', error);
    res.status(500).json({ error: '投票失败' });
  }
});

/**
 * 撤回投票
 * DELETE /api/v1/votes
 * Body: { phone: string }
 */
router.delete('/', requireAuth, async (req: any, res: any) => {
  try {
    const { phone } = req.body;
    const userId = req.userId;

    if (!phone) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '手机号格式无效' });
    }

    const normalizedPhone = normalizePhone(phone);

    await db.execute(sql`
      DELETE FROM number_votes 
      WHERE phone = ${normalizedPhone} AND user_id = ${userId}
    `);

    res.json({ success: true });
  } catch (error) {
    console.error('Vote retract error:', error);
    res.status(500).json({ error: '撤回失败' });
  }
});

/**
 * 批量查询社区投票结果
 * POST /api/v1/votes/batch-query
 * Body: { phones: string[] }
 * Returns: { results: { phone, stopped_count, voter_count, community_status }[] }
 * 
 * 社区状态计算（基于不同用户数）：
 * - 不同用户投 stopped >= 3 → 'confirmed_stopped' (确认停机)
 * - 不同用户投 stopped >= 1 → 'maybe_stopped' (疑似停机)
 * - 无 stopped 投票 → null
 * 
 * 限制：单次最多 50 个号码
 */
router.post('/batch-query', async (req: any, res: any) => {
  try {
    const { phones } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: '缺少电话号码列表' });
    }

    // 限制单次查询数量：最多 50 个
    if (phones.length > 50) {
      return res.status(400).json({ error: '单次最多查询 50 个号码' });
    }

    // 过滤并标准化有效手机号
    const validPhones = phones
      .filter((p: string) => isValidPhone(p))
      .map((p: string) => normalizePhone(p));

    if (validPhones.length === 0) {
      return res.json({ results: [] });
    }

    // 查询不同用户数（非总票数）
    const votes = await db.execute(sql`
      SELECT phone, COUNT(DISTINCT user_id)::int as voter_count 
      FROM number_votes
      WHERE phone = ANY(${validPhones}::text[]) AND vote = 'stopped'
      GROUP BY phone
    `);

    // 构建结果
    const voterMap = new Map<string, number>();
    for (const row of votes as any[]) {
      voterMap.set(row.phone, row.voter_count);
    }

    const results = [];
    for (const phone of validPhones) {
      const voterCount = voterMap.get(phone) || 0;
      let communityStatus: string | null = null;
      
      if (voterCount >= CONFIRMED_THRESHOLD) {
        communityStatus = 'confirmed_stopped';
      } else if (voterCount >= MAYBE_THRESHOLD) {
        communityStatus = 'maybe_stopped';
      }
      
      results.push({
        phone,
        stopped_count: voterCount,  // 现在是不同用户数
        voter_count: voterCount,
        community_status: communityStatus,
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('Batch query error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
