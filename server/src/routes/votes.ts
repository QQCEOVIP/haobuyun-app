import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';

const router: any = Router();

// 阈值配置
const CONFIRMED_THRESHOLD = 5; // >=5 人标记停机 -> 确认停机
const MAYBE_THRESHOLD = 1;     // >=1 人标记停机 -> 疑似停机

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
 * Body: { phone: string, vote: 'normal' | 'stopped' }
 */
router.post('/', requireAuth, async (req: any, res: any) => {
  try {
    const { phone, vote } = req.body;
    const userId = req.userId;

    if (!phone || !vote) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!['normal', 'stopped'].includes(vote)) {
      return res.status(400).json({ error: '无效的投票类型，必须是 normal 或 stopped' });
    }

    // UPSERT: 如果已存在则更新，否则插入
    const result = await db.execute(sql`
      INSERT INTO number_votes (phone, user_id, vote, created_at, updated_at)
      VALUES (${phone}, ${userId}, ${vote}, NOW(), NOW())
      ON CONFLICT (phone, user_id) 
      DO UPDATE SET vote = EXCLUDED.vote, updated_at = NOW()
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
 * Body: { phones: string[], user_id: string }
 * Returns: { results: { [phone]: { stopped_count, normal_count, my_vote, community_status } } }
 */
router.post('/batch-query', async (req: any, res: any) => {
  try {
    const { phones, user_id } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: '缺少电话号码列表' });
    }

    // 限制单次查询数量
    const limitedPhones = phones.slice(0, 500);

    // 查询所有投票统计
    const voteStats = await db.execute(sql`
      SELECT 
        phone,
        COUNT(*) FILTER (WHERE vote = 'stopped')::int as stopped_count,
        COUNT(*) FILTER (WHERE vote = 'normal')::int as normal_count
      FROM number_votes
      WHERE phone = ANY(${limitedPhones}::text[])
      GROUP BY phone
    `);

    // 查询当前用户的投票
    let myVotes: any[] = [];
    if (user_id) {
      myVotes = await db.execute(sql`
        SELECT phone, vote
        FROM number_votes
        WHERE phone = ANY(${limitedPhones}::text[]) AND user_id = ${user_id}
      `);
    }

    // 构建用户投票映射
    const myVoteMap = new Map<string, string>();
    for (const row of myVotes as any[]) {
      myVoteMap.set(row.phone, row.vote);
    }

    // 构建结果
    const results: Record<string, any> = {};
    for (const phone of limitedPhones) {
      const stats = (voteStats as any[]).find((r: any) => r.phone === phone);
      const stoppedCount = stats?.stopped_count || 0;
      const normalCount = stats?.normal_count || 0;
      const myVote = myVoteMap.get(phone) || null;
      
      let communityStatus: string | null = null;
      if (stoppedCount >= CONFIRMED_THRESHOLD) {
        communityStatus = 'confirmed_invalid';
      } else if (stoppedCount >= MAYBE_THRESHOLD) {
        communityStatus = 'possibly_invalid';
      }
      
      results[phone] = {
        stopped_count: stoppedCount,
        normal_count: normalCount,
        my_vote: myVote,
        community_status: communityStatus,
      };
    }

    res.json({ results });
  } catch (error) {
    console.error('Batch query error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
