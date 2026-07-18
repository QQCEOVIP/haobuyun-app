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
 * GET /api/v1/community-statuses?user_id=xxx
 * Returns: { statuses: { phone, status, vote_count, authenticated_name?, is_self_mark? }[] }
 * 
 * 规则：
 * - 有 stopped 投票的号码都返回（阈值降为1，以支持本人标记）
 * - >10 个不同用户投 stopped 且无人认证 → 'confirmed_invalid'
 * - 1~10 个不同用户投 stopped → 'possibly_invalid'
 * - 本人标记双重判定：如果 user_id 参数对应的用户对该号码有 active 的 number_changes，
 *   则对该用户返回 'confirmed_invalid'（即使只有1票）
 * - 30天过期
 */
router.get('/', async (req: any, res: any) => {
  try {
    const userId = req.query.user_id as string | undefined;

    // 查询所有有 stopped 投票的号码（阈值>=1，包含本人标记）
    const result = await db.execute(sql`
      SELECT 
        v.phone::TEXT,
        COUNT(DISTINCT CASE WHEN v.vote = 'stopped' THEN v.user_id END)::INTEGER as stopped_count,
        COUNT(DISTINCT v.user_id)::INTEGER as vote_count,
        MAX(v.updated_at) as last_vote_at
      FROM number_votes v
      GROUP BY v.phone
      HAVING COUNT(DISTINCT CASE WHEN v.vote = 'stopped' THEN v.user_id END) >= 1
         AND MAX(v.updated_at) > NOW() - INTERVAL '30 days'
    `);

    const rows = (result as any[]) || [];
    if (rows.length === 0) {
      return res.json({ statuses: [] });
    }

    const phones = rows.map((r: any) => r.phone);

    // Batch fetch authenticated names
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

    // 查询当前用户的本人标记（active 且未过期的 number_changes）
    let selfMarkPhones = new Set<string>();
    if (userId) {
      try {
        const selfMarkResult = await db.execute(sql`
          SELECT old_phone::TEXT
          FROM number_changes
          WHERE publisher_id = ${userId}
            AND status = 'active'
            AND expires_at > NOW()
        `);
        for (const row of (selfMarkResult as any[])) {
          selfMarkPhones.add(row.old_phone);
        }
      } catch (e) {
        // number_changes 表可能不存在，忽略
        console.log('number_changes query skipped:', (e as any)?.message);
      }
    }

    // 构建状态列表
    const statuses = rows.map((r: any) => {
      const stoppedCount = parseInt(r.stopped_count, 10);
      const hasAuth = authMap.has(r.phone);
      const isSelfMark = selfMarkPhones.has(r.phone);
      let status: string;

      if (isSelfMark) {
        // 本人标记双重判定：对自己直接判定为"确认失效"
        status = 'confirmed_invalid';
      } else if (hasAuth) {
        // 有人认证了换机主，无论多少停用票都只判定可能失效
        status = 'possibly_invalid';
      } else if (stoppedCount > 10) {
        // >10票停用且无人认证 → 确认失效
        status = 'confirmed_invalid';
      } else {
        // 1~10票停用 → 可能失效
        status = 'possibly_invalid';
      }

      const item: any = {
        phone: r.phone,
        status,
        vote_count: parseInt(r.vote_count, 10),
        stopped_count: stoppedCount,
      };
      if (isSelfMark) {
        item.is_self_mark = true;
      }
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
