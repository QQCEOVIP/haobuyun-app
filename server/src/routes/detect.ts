import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';
import { isValidPhone, normalizePhone } from '../middleware/rate-limit';

const router: any = Router();

// 阈值配置（基于不同用户数）
const CONFIRMED_THRESHOLD = 11; // >10 个不同用户标记停用且无人认证 → 确认失效
const MAYBE_THRESHOLD = 3;      // >=3 个不同用户标记停用 → 可能失效 (3-10票)

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
 * Body: { phones: string[] }
 * 
 * 限制：单次最多 50 个号码
 * 状态判定基于不同用户数（非总票数）
 */
router.post('/', requireAuth, async (req: any, res: any) => {
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
      return res.json({ results: {}, summary: { total: 0, normal: 0, possibly_invalid: 0, confirmed_invalid: 0 } });
    }

    // 查询投票统计：使用 COUNT(DISTINCT user_id) 计算不同用户数（容错：表不存在时返回空）
    // 30天过期：只统计30天内有更新的号码
    let voteStats: any[] = [];
    try {
      voteStats = await db.execute(sql`
        SELECT 
          phone,
          COUNT(DISTINCT user_id) FILTER (WHERE vote = 'stopped')::int as stopped_voters,
          COUNT(DISTINCT user_id) FILTER (WHERE vote = 'normal')::int as normal_voters
        FROM number_votes
        WHERE phone IN (
          ${sql.join(
            validPhones.map(phone => sql`${phone}`),
            sql`, `
          )}
        )
        GROUP BY phone
        HAVING MAX(updated_at) > NOW() - INTERVAL '30 days'
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
        WHERE phone IN (
          ${sql.join(
            validPhones.map(phone => sql`${phone}`),
            sql`, `
          )}
        )
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
      total: validPhones.length,
      normal: 0,
      possibly_invalid: 0,
      confirmed_invalid: 0,
    };

    for (const phone of validPhones) {
      const stats = voteStats.find((r: any) => r.phone === phone);
      const stoppedVoters = stats?.stopped_voters || 0;
      const normalVoters = stats?.normal_voters || 0;
      const auth = authMap.get(phone) || { auth_count: 0, auth_names: [] };

      let status: string;

      if (stoppedVoters === 0) {
        status = 'normal';
        summary.normal++;
      } else if (auth.auth_count > 0) {
        // 有人认证了换机主，无论多少停用票都只判定可能失效
        status = 'possibly_invalid';
        summary.possibly_invalid++;
      } else if (stoppedVoters > 10) {
        // >10票停用且无人认证 → 确认失效
        status = 'confirmed_invalid';
        summary.confirmed_invalid++;
      } else {
        // 3-10票停用 → 可能失效
        status = 'possibly_invalid';
        summary.possibly_invalid++;
      }

      results[phone] = {
        status,
        stopped_count: stoppedVoters,  // 不同用户数
        normal_count: normalVoters,
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
