import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';

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

/**
 * 加密姓名：张明 → 张*明，李 → 李*，欧阳修 → 欧*修
 */
function encryptName(name: string): string {
  if (!name || name.length === 0) return '';
  if (name.length === 1) return name + '*';
  if (name.length === 2) return name[0] + '*' + name[1];
  // 长度>=3：首字 + * + 尾字
  return name[0] + '*' + name[name.length - 1];
}

/**
 * 认证号码
 * POST /api/v1/authenticate
 * Body: { phone: string, user_id: string, user_name: string }
 * Returns: { success: true, certified: boolean, encrypted_name: string }
 * 
 * 认证判定：
 * - 同一号码>=5人认证同一姓名 → 认证通过 → 关闭认证通道
 */
router.post('/', requireAuth, async (req: any, res: any) => {
  try {
    const { phone, user_name } = req.body;
    const userId = req.userId;

    if (!phone || !user_name) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // UPSERT 认证记录
    await db.execute(sql`
      INSERT INTO number_authentications (phone, user_id, user_name, authenticated_at, expires_at)
      VALUES (${phone}, ${userId}, ${user_name}, NOW(), NOW() + INTERVAL '1 month')
      ON CONFLICT (phone, user_id) 
      DO UPDATE SET user_name = EXCLUDED.user_name, authenticated_at = NOW(), expires_at = NOW() + INTERVAL '1 month'
    `);

    // 查询该号码的所有认证，检查是否>=5人认证同一姓名
    const auths = await db.execute(sql`
      SELECT user_name, COUNT(*)::int as count
      FROM number_authentications
      WHERE phone = ${phone}
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
      WHERE phone = ${phone}
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
 * 查询认证状态
 * GET /api/v1/authenticate/:phone
 * Returns: { auth_count, certified, encrypted_names: string[] }
 */
router.get('/:phone', async (req: any, res: any) => {
  try {
    const { phone } = req.params;

    // 查询认证统计
    const stats = await db.execute(sql`
      SELECT 
        COUNT(*)::int as auth_count,
        ARRAY_AGG(DISTINCT user_name) as user_names
      FROM number_authentications
      WHERE phone = ${phone}
    `);

    const row = (stats as any[])?.[0];
    const authCount = row?.auth_count || 0;
    const userNames: string[] = row?.user_names || [];

    // 检查是否有任何姓名>=5人认证
    const nameCounts = await db.execute(sql`
      SELECT user_name, COUNT(*)::int as count
      FROM number_authentications
      WHERE phone = ${phone}
      GROUP BY user_name
    `);

    const certified = (nameCounts as any[]).some((r: any) => r.count >= AUTH_THRESHOLD);

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
