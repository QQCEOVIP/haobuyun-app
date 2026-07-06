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

// 阈值配置
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
 * 一键检测 - 批量聚合号码状态
 * POST /api/v1/detect
 * Body: { phones: string[], user_id?: string }
 *
 * 聚合规则：
 * - stopped票数 >= 5 → "stopped"（确认停机）
 * - stopped票数 1~4 → "suspected_stopped"（疑似停机）
 * - 其他 → "normal"（正常）
 * - 如有有效认证 → 覆盖为 "normal"
 *
 * Returns: { results: { phone, status, votes: { stopped, normal, suspected_stopped }, authenticated }[] }
 */
router.post('/', requireDb, requireAuth, async (req: any, res: any) => {
  try {
    const { phones } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: '缺少电话号码列表' });
    }

    const limitedPhones = phones.slice(0, 500);

    // 1. 查询每个号码的各状态投票数
    // 使用 IN 子句代替 ANY，兼容 postgres 库的参数传递
    const phoneConditions = limitedPhones.map((p: string) => `'${p.replace(/'/g, "''")}'`).join(',');
    const voteCounts = await db.execute(sql.raw(
      `SELECT phone, vote, COUNT(*)::int as count FROM number_votes WHERE phone IN (${phoneConditions}) GROUP BY phone, vote`
    ));

    // 构建票数映射
    const votesMap = new Map<string, { stopped: number; normal: number; suspected_stopped: number }>();
    for (const phone of limitedPhones) {
      votesMap.set(phone, { stopped: 0, normal: 0, suspected_stopped: 0 });
    }
    for (const row of voteCounts as any[]) {
      const entry = votesMap.get(row.phone);
      if (entry && row.vote in entry) {
        (entry as any)[row.vote] = row.count;
      }
    }

    // 2. 查询有效认证（未过期）
    const authentications = await db.execute(sql.raw(
      `SELECT phone, user_name, authenticated_at, expires_at FROM number_authentications WHERE phone IN (${phoneConditions}) AND expires_at > NOW()`
    ));

    const authMap = new Map<string, { user_name: string; authenticated_at: string; expires_at: string }>();
    for (const row of authentications as any[]) {
      authMap.set(row.phone, {
        user_name: row.user_name,
        authenticated_at: row.authenticated_at,
        expires_at: row.expires_at,
      });
    }

    // 3. 聚合状态
    const results = limitedPhones.map((phone) => {
      const votes = votesMap.get(phone) || { stopped: 0, normal: 0, suspected_stopped: 0 };
      const auth = authMap.get(phone);

      let status: string;
      if (auth) {
        // 有有效认证 → 正常
        status = 'normal';
      } else if (votes.stopped >= CONFIRMED_THRESHOLD) {
        status = 'stopped';
      } else if (votes.stopped >= MAYBE_THRESHOLD) {
        status = 'suspected_stopped';
      } else {
        status = 'normal';
      }

      return {
        phone,
        status,
        votes,
        authenticated: auth
          ? { user_name: auth.user_name, authenticated_at: auth.authenticated_at, expires_at: auth.expires_at }
          : null,
      };
    });

    res.json({ success: true, results });
  } catch (error) {
    console.error('Detect error:', error);
    res.status(500).json({ error: '检测失败' });
  }
});

export default router;
