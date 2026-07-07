import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';

const router: any = Router();

// 阈值配置
const CONFIRMED_THRESHOLD = 5; // >=5 人标记停机 -> 确认失效
const MAYBE_THRESHOLD = 1;     // >=1 人标记停机 -> 可能失效

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

function isTableNotExistError(err: any): boolean {
  return err?.code === '42P01' || (err?.message && err.message.includes('does not exist'));
}

/**
 * 一键检测
 * POST /api/v1/detect
 * Body: { phones: string[], user_id: string }
 */
router.post('/', requireAuth, async (req: any, res: any) => {
  try {
    const { phones } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: '缺少电话号码列表' });
    }

    const limitedPhones = phones.slice(0, 500);

    // 查询投票统计（容错：表不存在时返回空）
    let voteStats: any[] = [];
    try {
      voteStats = await db.execute(sql`
        SELECT 
          phone,
          COUNT(*) FILTER (WHERE vote = 'stopped')::int as stopped_count,
          COUNT(*) FILTER (WHERE vote = 'normal')::int as normal_count
        FROM number_votes
        WHERE phone = ANY(${limitedPhones}::text[])
        GROUP BY phone
      `) as any[];
    } catch (err: any) {
      if (!isTableNotExistError(err)) throw err;
    }

    // 查询认证信息（容错：表不存在时返回空）
    let authData: any[] = [];
    try {
      authData = await db.execute(sql`
        SELECT 
          phone,
          COUNT(*)::int as auth_count,
          ARRAY_AGG(DISTINCT user_name) as auth_names
        FROM number_authentications
        WHERE phone = ANY(${limitedPhones}::text[])
        GROUP BY phone
      `) as any[];
    } catch (err: any) {
      if (!isTableNotExistError(err)) throw err;
    }

    // 构建认证数据映射
    const authMap = new Map<string, { auth_count: number; auth_names: string[] }>();
    for (const row of authData) {
      authMap.set(row.phone, {
        auth_count: row.auth_count,
        auth_names: row.auth_names || [],
      });
    }

    // 构建结果
    const results: Record<string, any> = {};
    const summary = {
      total: limitedPhones.length,
      normal: 0,
      possibly_invalid: 0,
      confirmed_invalid: 0,
    };

    for (const phone of limitedPhones) {
      const stats = voteStats.find((r: any) => r.phone === phone);
      const stoppedCount = stats?.stopped_count || 0;
      const normalCount = stats?.normal_count || 0;
      const auth = authMap.get(phone) || { auth_count: 0, auth_names: [] };

      let status: string;

      if (stoppedCount === 0) {
        status = 'normal';
        summary.normal++;
      } else if (stoppedCount < CONFIRMED_THRESHOLD) {
        status = 'possibly_invalid';
        summary.possibly_invalid++;
      } else {
        if (auth.auth_count >= stoppedCount) {
          status = 'possibly_invalid';
          summary.possibly_invalid++;
        } else {
          status = 'confirmed_invalid';
          summary.confirmed_invalid++;
        }
      }

      results[phone] = {
        status,
        stopped_count: stoppedCount,
        normal_count: normalCount,
        auth_count: auth.auth_count,
        auth_names: auth.auth_names,
      };
    }

    res.json({ results, summary });
  } catch (error) {
    console.error('Detect error:', error);
    res.status(500).json({ error: '检测失败' });
  }
});

export default router;
