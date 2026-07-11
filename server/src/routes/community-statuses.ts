import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';

const router: any = Router();

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
 * 查询所有社区投票状态（批量）
 * GET /api/v1/community-statuses
 * Returns: { statuses: { phone, status, vote_count, authenticated_name? }[] }
 * 
 * 新规则：
 * - >10 个不同用户投 stopped 且无人认证换机主 → 'confirmed_invalid'
 * - 3~10 个不同用户投 stopped → 'possibly_invalid'
 * - 有人认证了换机主，无论多少停用票都只判定 'possibly_invalid'
 * - 30天过期：从最后一条投票时间算起，超过30天无新投票则不返回该号码状态
 */
router.get('/', async (_req: any, res: any) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        v.phone::TEXT,
        COUNT(DISTINCT CASE WHEN v.vote = 'stopped' THEN v.user_id END)::INTEGER as stopped_count,
        COUNT(DISTINCT v.user_id)::INTEGER as vote_count,
        MAX(v.updated_at) as last_vote_at
      FROM number_votes v
      GROUP BY v.phone
      HAVING COUNT(DISTINCT CASE WHEN v.vote = 'stopped' THEN v.user_id END) >= 3
         AND MAX(v.updated_at) > NOW() - INTERVAL '30 days'
    `);

    const rows = (result as any[]) || [];
    if (rows.length === 0) {
      return res.json({ statuses: [] });
    }

    // Batch fetch authenticated names for all phones
    const phones = rows.map((r: any) => r.phone);
    const authResult = await db.execute(sql`
      SELECT DISTINCT ON (phone) phone, user_name
      FROM number_authentications
      WHERE phone IN (${sql.join(phones.map(p => sql`${p}`), sql`, `)})
      ORDER BY phone, authenticated_at DESC
    `);

    const authMap = new Map<string, string>();
    for (const row of (authResult as any[])) {
      authMap.set(row.phone, encryptName(row.user_name));
    }

    // Apply new rules
    const statuses = rows.map((r: any) => {
      const stoppedCount = parseInt(r.stopped_count, 10);
      const hasAuth = authMap.has(r.phone);
      let status: string;

      if (hasAuth) {
        // 有人认证了换机主，无论多少停用票都只判定可能失效
        status = 'possibly_invalid';
      } else if (stoppedCount > 10) {
        // >10票停用且无人认证 → 确认失效
        status = 'confirmed_invalid';
      } else {
        // 3~10票停用 → 可能失效
        status = 'possibly_invalid';
      }

      const item: any = {
        phone: r.phone,
        status,
        vote_count: parseInt(r.vote_count, 10),
      };
      const authName = authMap.get(r.phone);
      if (authName) {
        item.authenticated_name = authName;
      }
      return item;
    });

    res.json({ statuses });
  } catch (error) {
    console.error('Get community statuses error:', error);
    res.status(500).json({ error: '查询社区状态失败' });
  }
});

export default router;
