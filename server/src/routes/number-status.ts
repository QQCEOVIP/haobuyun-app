import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';

const router: any = Router();

// 阈值配置
const CONFIRMED_THRESHOLD = 5;
const MAYBE_THRESHOLD = 1;

/**
 * 查询单个号码状态
 * GET /api/v1/number-status/:phone
 */
router.get('/:phone', async (req: any, res: any) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      return res.status(400).json({ error: '缺少电话号码' });
    }

    // 1. 查询投票统计
    const voteCounts = await (db as any).execute(sql`
      SELECT vote, COUNT(*)::int as count
      FROM number_votes
      WHERE phone = ${phone}
      GROUP BY vote
    `);

    const votes = { stopped: 0, normal: 0, suspected_stopped: 0 };
    for (const row of voteCounts as any[]) {
      if (row.vote in votes) {
        (votes as any)[row.vote] = row.count;
      }
    }

    // 2. 查询有效认证
    const authResult = await (db as any).execute(sql`
      SELECT user_name, authenticated_at, expires_at
      FROM number_authentications
      WHERE phone = ${phone}
        AND expires_at > NOW()
      LIMIT 1
    `);

    const auth = (authResult as any[])?.[0] || null;

    // 3. 聚合状态
    let status: string;
    if (auth) {
      status = 'normal';
    } else if (votes.stopped >= CONFIRMED_THRESHOLD) {
      status = 'stopped';
    } else if (votes.stopped >= MAYBE_THRESHOLD) {
      status = 'suspected_stopped';
    } else {
      status = 'normal';
    }

    res.json({
      success: true,
      phone,
      status,
      votes,
      authenticated: auth
        ? { user_name: auth.user_name, authenticated_at: auth.authenticated_at, expires_at: auth.expires_at }
        : null,
    });
  } catch (error) {
    console.error('Number status error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
