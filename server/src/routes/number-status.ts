import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';
import { isValidPhone, normalizePhone } from '../middleware/rate-limit';

const router: any = Router();

// 阈值配置（基于不同用户数）
const CONFIRMED_THRESHOLD = 11; // >10 票且无人认证 → 确认失效
const MAYBE_THRESHOLD = 3;     // >=3 票 → 可能失效

/**
 * 加密姓名：张明 → 张*明，李 → 李*，欧阳修 → 欧*修
 */
function encryptName(name: string): string {
  if (!name || name.length === 0) return '';
  if (name.length === 1) return name + '*';
  if (name.length === 2) return name[0] + '*' + name[1];
  return name[0] + '*' + name[name.length - 1];
}

/**
 * 查询单个号码完整状态
 * GET /api/v1/number-status/:phone
 * Returns: { phone, status, stopped_count, normal_count, auth_count, certified, auth_names }
 * 
 * 状态判定（基于不同用户数）：
 * - 0 个用户标记停用 → "normal"
 * - 1~2 个用户标记停用 → "possibly_invalid"
 * - ≥3 个用户标记停用 + 认证人数 < 标记人数 → "confirmed_invalid"
 * - ≥3 个用户标记停用 + 认证人数 ≥ 标记人数 → "possibly_invalid"
 */
router.get('/:phone', async (req: any, res: any) => {
  try {
    const { phone } = req.params;

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '手机号格式无效' });
    }

    const normalizedPhone = normalizePhone(phone);

    // 查询投票统计：使用 COUNT(DISTINCT user_id)
    const voteStats = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT user_id) FILTER (WHERE vote = 'stopped')::int as stopped_voters,
        COUNT(DISTINCT user_id) FILTER (WHERE vote = 'normal')::int as normal_voters
      FROM number_votes
      WHERE phone = ${normalizedPhone}
    `);

    const stats = (voteStats as any[])?.[0];
    const stoppedCount = stats?.stopped_voters || 0;
    const normalCount = stats?.normal_voters || 0;

    // 查询认证信息（包含时间和有效期）
    const authData = await db.execute(sql`
      SELECT 
        COUNT(*)::int as auth_count,
        ARRAY_AGG(DISTINCT user_name) as auth_names
      FROM number_authentications
      WHERE phone = ${normalizedPhone}
    `);

    const auth = (authData as any[])?.[0];
    const authCount = auth?.auth_count || 0;
    const authNames: string[] = auth?.auth_names || [];
    const encryptedNames = authNames.map((name: string) => encryptName(name));

    // 查询最新认证时间和有效期
    let authenticatedAt: string | null = null;
    let expiresAt: string | null = null;
    if (authCount > 0) {
      const authTimeResult = await db.execute(sql`
        SELECT authenticated_at, expires_at
        FROM number_authentications
        WHERE phone = ${normalizedPhone}
        ORDER BY authenticated_at DESC
        LIMIT 1
      `);
      const authTimeRow = (authTimeResult as any[])?.[0];
      if (authTimeRow) {
        // 转换为 ISO 格式确保前端能正确解析
        authenticatedAt = authTimeRow.authenticated_at ? new Date(authTimeRow.authenticated_at).toISOString() : null;
        expiresAt = authTimeRow.expires_at ? new Date(authTimeRow.expires_at).toISOString() : null;
      }
    }

    // 判定状态
    let status: string;
    if (stoppedCount === 0) {
      status = 'normal';
    } else if (stoppedCount < MAYBE_THRESHOLD) {
      status = 'normal'; // 少于3票，不显示状态
    } else if (authCount > 0) {
      // 有人认证了换机主，无论多少停用票都只判定可能失效
      status = 'possibly_invalid';
    } else if (stoppedCount > 10) {
      // >10票停用且无人认证 → 确认失效
      status = 'confirmed_invalid';
    } else {
      // 3-10票停用 → 可能失效
      status = 'possibly_invalid';
    }

    res.json({ 
      phone: normalizedPhone,
      status,
      stopped_count: stoppedCount,  // 不同用户数
      normal_count: normalCount,
      auth_count: authCount,
      certified: authCount >= MAYBE_THRESHOLD && authNames.length > 0,
      auth_names: encryptedNames,
      // 前端需要的字段
      is_authenticated: authCount > 0,
      authenticated_name: encryptedNames.length > 0 ? encryptedNames[0] : undefined,
      authenticated_at: authenticatedAt,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('Get number status error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
