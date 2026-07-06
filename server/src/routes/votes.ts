import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';

const router: any = Router();

// 检查数据库连接
function requireDb(req: any, res: any, next: any) {
  if (!db) {
    return res.status(503).json({ error: '数据库未配置' });
  }
  next();
}

// 阈值配置（可配置）
// >=5 人标记停机 -> 确认停机
// >=1 人标记停机 -> 疑似停机
const CONFIRMED_THRESHOLD = 5;
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
 */
router.post('/', requireDb, requireAuth, async (req: any, res: any) => {
  try {
    const { phone, vote } = req.body;
    const userId = req.userId;

    if (!phone || !vote) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!['stopped', 'valid', 'normal', 'suspected_stopped'].includes(vote)) {
      return res.status(400).json({ error: '无效的投票类型' });
    }

    // 使用 raw SQL 绕过 RLS
    const result = await db.execute(sql`
      INSERT INTO number_votes (phone, user_id, vote, created_at, updated_at)
      VALUES (${phone}, ${userId}, ${vote}, NOW(), NOW())
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
router.delete('/', requireDb, requireAuth, async (req: any, res: any) => {
  try {
    const { phone } = req.body;
    const userId = req.userId;

    if (!phone) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    await db.execute(sql`
      DELETE FROM number_votes 
      WHERE phone = ${phone} AND user_id = ${userId}
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
 * Returns: { results: { phone, stopped_count, community_status }[] }
 * 
 * 社区状态计算：
 * - stopped_count >= 5 -> 'confirmed_stopped' (确认停机)
 * - stopped_count >= 1 && < 5 -> 'maybe_stopped' (疑似停机)
 * - stopped_count = 0 -> null (无社区状态)
 */
router.post('/batch-query', requireDb, async (req: any, res: any) => {
  try {
    const { phones } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: '缺少电话号码列表' });
    }

    // 限制单次查询数量
    const limitedPhones = phones.slice(0, 500);
    const phoneConditions = limitedPhones.map((p: string) => `'${p.replace(/'/g, "''")}'`).join(',');

    // 查询所有 'stopped' 投票
    const votes = await db.execute(sql.raw(
      `SELECT phone, COUNT(*)::int as stopped_count FROM number_votes WHERE phone IN (${phoneConditions}) AND vote = 'stopped' GROUP BY phone`
    ));

    // 构建结果
    const stoppedMap = new Map<string, number>();
    for (const row of votes as any[]) {
      stoppedMap.set(row.phone, row.stopped_count);
    }

    const results = [];
    for (const phone of limitedPhones) {
      const stoppedCount = stoppedMap.get(phone) || 0;
      let communityStatus: string | null = null;
      
      if (stoppedCount >= CONFIRMED_THRESHOLD) {
        communityStatus = 'confirmed_stopped';
      } else if (stoppedCount >= MAYBE_THRESHOLD) {
        communityStatus = 'maybe_stopped';
      }
      
      results.push({
        phone,
        stopped_count: stoppedCount,
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
