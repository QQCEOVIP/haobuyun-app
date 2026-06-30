import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';

const router: any = Router();

// 阈值配置（可配置）
const CONFIRMED_THRESHOLD = 3;
const MAYBE_THRESHOLD = 2;

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
 * Body: { phone: string, vote: 'confirmed_invalid' | 'maybe_invalid' | 'valid' }
 */
router.post('/', requireAuth, async (req: any, res: any) => {
  try {
    const { phone, vote } = req.body;
    const userId = req.userId;

    if (!phone || !vote) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!['confirmed_invalid', 'maybe_invalid', 'valid'].includes(vote)) {
      return res.status(400).json({ error: '无效的投票类型' });
    }

    // 使用 raw SQL 绕过 RLS
    const result = await db.execute(sql`
      INSERT INTO number_votes (phone, user_id, vote, created_at, updated_at)
      VALUES (${phone}, ${userId}::uuid, ${vote}, NOW(), NOW())
      ON CONFLICT (phone, user_id) 
      DO UPDATE SET vote = ${vote}, updated_at = NOW()
      RETURNING id, phone, user_id, vote, created_at, updated_at
    `);

    res.json({ success: true, data: result?.[0] || null });
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

    await db.execute(sql`
      DELETE FROM number_votes 
      WHERE phone = ${phone} AND user_id = ${userId}::uuid
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
 * Returns: { results: { phone, confirmed_invalid_count, maybe_invalid_count, total_count, community_status }[] }
 */
router.post('/batch-query', async (req: any, res: any) => {
  try {
    const { phones } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: '缺少电话号码列表' });
    }

    // 限制单次查询数量
    const limitedPhones = phones.slice(0, 500);

    // 查询所有相关投票
    const votes = await db.execute(sql`
      SELECT phone, vote, COUNT(*)::int as count 
      FROM number_votes
      WHERE phone = ANY(${limitedPhones}::text[])
      GROUP BY phone, vote
    `);

    // 聚合结果
    const phoneMap = new Map<string, { confirmedCount: number; maybeCount: number; totalCount: number }>();
    
    for (const row of votes as any[]) {
      const { phone, vote, count } = row;
      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, { confirmedCount: 0, maybeCount: 0, totalCount: 0 });
      }
      const entry = phoneMap.get(phone)!;
      if (vote === 'confirmed_invalid') {
        entry.confirmedCount = count;
      } else if (vote === 'maybe_invalid') {
        entry.maybeCount = count;
      }
      entry.totalCount += count;
    }

    // 计算社区状态
    const results = [];
    for (const phone of limitedPhones) {
      const entry = phoneMap.get(phone);
      if (entry) {
        let communityStatus: string | null = null;
        if (entry.confirmedCount >= CONFIRMED_THRESHOLD) {
          communityStatus = 'confirmed_invalid';
        } else if (entry.maybeCount >= MAYBE_THRESHOLD) {
          communityStatus = 'maybe_invalid';
        }
        results.push({
          phone,
          confirmed_invalid_count: entry.confirmedCount,
          maybe_invalid_count: entry.maybeCount,
          total_count: entry.totalCount,
          community_status: communityStatus,
        });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Batch query error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
