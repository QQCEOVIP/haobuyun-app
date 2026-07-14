import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';
import { isValidPhone, normalizePhone } from '../middleware/rate-limit';

const router: any = Router();

// 认证阈值：同一号码>=5人认证同一姓名 → 认证通过
const AUTH_THRESHOLD = 5;

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
 * 加密姓名：张明 → 张*明，李 → 李*，欧阳修 → 欧*修
 */
function encryptName(name: string): string {
  if (!name || name.length === 0) return '';
  if (name.length === 1) return name + '*';
  if (name.length === 2) return name[0] + '*' + name[1];
  return name[0] + '*' + name[name.length - 1];
}

/**
 * 认证号码
 * POST /api/v1/authenticate
 * Body: { phone: string, user_name: string }
 * 
 * 输入验证：
 * - 手机号格式校验
 * - user_name 长度 1-20 字符
 */
router.post('/', requireAuth, async (req: any, res: any) => {
  try {
    const { phone, user_name } = req.body;
    const userId = req.userId;

    if (!phone || !user_name) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '手机号格式无效' });
    }

    if (typeof user_name !== 'string' || user_name.length < 1 || user_name.length > 20) {
      return res.status(400).json({ error: '姓名长度需在 1-20 字符之间' });
    }

    const normalizedPhone = normalizePhone(phone);

    // UPSERT 认证记录（容错：表不存在时返回友好提示）
    try {
      await db.execute(sql`
        INSERT INTO number_authentications (phone, user_id, user_name, authenticated_at, expires_at)
        VALUES (${normalizedPhone}, ${userId}, ${user_name}, NOW(), NOW() + INTERVAL '1 month')
        ON CONFLICT (phone, user_id) 
        DO UPDATE SET user_name = EXCLUDED.user_name, authenticated_at = NOW(), expires_at = NOW() + INTERVAL '1 month'
      `);
    } catch (err: any) {
      if (isTableNotExistError(err)) {
        return res.status(503).json({ error: '认证服务暂未开放' });
      }
      throw err;
    }

    // 查询该号码的所有认证，检查是否>=5人认证同一姓名
    const auths = await db.execute(sql`
      SELECT user_name, COUNT(*)::int as count
      FROM number_authentications
      WHERE phone = ${normalizedPhone}
      GROUP BY user_name
      ORDER BY count DESC
      LIMIT 1
    `);

    const topAuth = (auths as any[])?.[0];
    const certified = topAuth && topAuth.count >= AUTH_THRESHOLD;

    // 查询所有加密后的姓名
    const allAuths = await db.execute(sql`
      SELECT DISTINCT user_name
      FROM number_authentications
      WHERE phone = ${normalizedPhone}
    `);

    const encryptedNames = (allAuths as any[]).map((r: any) => encryptName(r.user_name));

    res.json({
      success: true,
      certified,
      encrypted_name: encryptName(user_name),
      encrypted_names: encryptedNames,
    });
  } catch (error) {
    console.error('Authenticate error:', error);
    res.status(500).json({ error: '认证失败' });
  }
});

/**
 * 获取当前用户已认证的号码列表
 * GET /api/v1/authenticated-numbers
 * Query: page?: number, limit?: number
 */
router.get('/my-authentications', requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20')));
    const offset = (page - 1) * limit;

    let authentications: any[] = [];
    let total = 0;

    try {
      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int as total
        FROM number_authentications
        WHERE user_id = ${userId}
      `);
      total = (countResult as any[])?.[0]?.total || 0;

      const authResult = await db.execute(sql`
        SELECT 
          na.phone,
          na.user_name,
          na.authenticated_at,
          na.expires_at,
          COALESCE(
            (SELECT COUNT(DISTINCT nv.user_id)::int 
             FROM number_votes nv 
             WHERE nv.phone = na.phone AND nv.vote = 'stopped'
             AND nv.updated_at > NOW() - INTERVAL '30 days'),
            0
          ) as stopped_vote_count
        FROM number_authentications na
        WHERE na.user_id = ${userId}
        ORDER BY na.authenticated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
      authentications = (authResult as any[]) || [];
    } catch (err: any) {
      if (isTableNotExistError(err)) {
        return res.json({ authentications: [], total: 0, page, limit });
      }
      throw err;
    }

    const result = authentications.map((auth: any) => ({
      phone: auth.phone,
      user_name: auth.user_name,
      encrypted_name: encryptName(auth.user_name),
      authenticated_at: auth.authenticated_at ? new Date(auth.authenticated_at).toISOString() : null,
      expires_at: auth.expires_at ? new Date(auth.expires_at).toISOString() : null,
      stopped_vote_count: auth.stopped_vote_count,
    }));

    res.json({
      authentications: result,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Get authentications error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

/**
 * 撤销认证（恢复为可能失效）
 * DELETE /api/v1/authenticated-numbers/:phone
 */
router.delete('/my-authentications/:phone', requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const { phone } = req.params;

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '手机号格式无效' });
    }

    const normalizedPhone = normalizePhone(phone);

    try {
      const result = await db.execute(sql`
        DELETE FROM number_authentications
        WHERE phone = ${normalizedPhone} AND user_id = ${userId}
        RETURNING id
      `);

      const deleted = (result as any[])?.length > 0;

      if (!deleted) {
        return res.status(404).json({ error: '未找到该号码的认证记录' });
      }

      res.json({
        success: true,
        message: '已撤销认证，号码恢复为可能失效',
      });
    } catch (err: any) {
      if (isTableNotExistError(err)) {
        return res.status(503).json({ error: '认证服务暂未开放' });
      }
      throw err;
    }
  } catch (error) {
    console.error('Revoke authentication error:', error);
    res.status(500).json({ error: '撤销失败' });
  }
});

/**
 * 查询认证状态
 * GET /api/v1/authenticate/:phone
 */
router.get('/:phone', async (req: any, res: any) => {
  try {
    const { phone } = req.params;

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '手机号格式无效' });
    }

    const normalizedPhone = normalizePhone(phone);

    let authCount = 0;
    let userNames: string[] = [];
    let certified = false;

    try {
      const stats = await db.execute(sql`
        SELECT 
          COUNT(*)::int as auth_count,
          ARRAY_AGG(DISTINCT user_name) as user_names
        FROM number_authentications
        WHERE phone = ${normalizedPhone}
      `);

      const row = (stats as any[])?.[0];
      authCount = row?.auth_count || 0;
      userNames = row?.user_names || [];

      const nameCounts = await db.execute(sql`
        SELECT user_name, COUNT(*)::int as count
        FROM number_authentications
        WHERE phone = ${normalizedPhone}
        GROUP BY user_name
      `);

      certified = (nameCounts as any[]).some((r: any) => r.count >= AUTH_THRESHOLD);
    } catch (err: any) {
      if (!isTableNotExistError(err)) throw err;
    }

    const encryptedNames = userNames.map((name: string) => encryptName(name));

    res.json({
      auth_count: authCount,
      certified,
      encrypted_names: encryptedNames,
    });
  } catch (error) {
    console.error('Get auth status error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
