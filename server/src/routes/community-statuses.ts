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
 * 阈值（基于不同用户数）：
 * - >=6 个不同用户投 stopped → 'confirmed_invalid'
 * - >=3 个不同用户投 stopped → 'possibly_invalid'
 */
router.get('/', async (_req: any, res: any) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        v.phone::TEXT,
        CASE 
          WHEN COUNT(DISTINCT CASE WHEN v.vote = 'stopped' THEN v.user_id END) >= 6 THEN 'confirmed_invalid'::TEXT
          WHEN COUNT(DISTINCT CASE WHEN v.vote = 'stopped' THEN v.user_id END) >= 3 THEN 'possibly_invalid'::TEXT
          ELSE NULL::TEXT
        END as status,
        COUNT(DISTINCT v.user_id)::INTEGER as vote_count
      FROM number_votes v
      GROUP BY v.phone
      HAVING COUNT(DISTINCT v.user_id) >= 3
    `);

    const statuses = (result as any[]) || [];

    // Batch fetch authenticated names for all phones
    if (statuses.length > 0) {
      const phones = statuses.map((s: any) => s.phone);
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

      for (const s of statuses) {
        const authName = authMap.get(s.phone);
        if (authName) {
          s.authenticated_name = authName;
        }
      }
    }

    res.json({ statuses });
  } catch (error) {
    console.error('Get community statuses error:', error);
    res.status(500).json({ error: '查询社区状态失败' });
  }
});

export default router;
