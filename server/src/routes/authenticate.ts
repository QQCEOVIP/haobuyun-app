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
 * 认证号码 - 确认号码正常使用
 * POST /api/v1/authenticate
 * Body: { phone: string, user_name: string }
 *
 * 逻辑：
 * 1. 写入/更新 number_authentications（有效期30天）
 * 2. 清除该号码所有"疑似停机"投票（vote='suspected_stopped'）
 *
 * Returns: { success: true, message: '认证成功' }
 */
router.post('/', requireDb, requireAuth, async (req: any, res: any) => {
  try {
    const { phone, user_name } = req.body;
    const userId = req.userId;

    if (!phone) {
      return res.status(400).json({ error: '缺少电话号码' });
    }

    // 1. UPSERT 认证记录（有效期30天）
    await db.execute(sql`
      INSERT INTO number_authentications (phone, user_id, user_name, authenticated_at, expires_at)
      VALUES (${phone}, ${userId}, ${user_name || null}, NOW(), NOW() + INTERVAL '30 days')
      ON CONFLICT (phone, user_id)
      DO UPDATE SET
        user_name = ${user_name || null},
        authenticated_at = NOW(),
        expires_at = NOW() + INTERVAL '30 days'
    `);

    // 2. 清除该号码所有"疑似停机"投票
    await db.execute(sql`
      DELETE FROM number_votes
      WHERE phone = ${phone} AND vote = 'suspected_stopped'
    `);

    res.json({ success: true, message: '认证成功' });
  } catch (error) {
    console.error('Authenticate error:', error);
    res.status(500).json({ error: '认证失败' });
  }
});

export default router;
