import { Router } from 'express';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';
import { isValidPhone, normalizePhone, isServiceNumber } from '../middleware/rate-limit';

const router: any = Router();

// 阈值配置（基于不同用户数）
// >10 个不同用户投"失效"且无人认证 → 确认停用
// >=3 个不同用户投"失效" → 疑似停用 (3-10票)
const CONFIRMED_THRESHOLD = 11;
const MAYBE_THRESHOLD = 3;

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
 * 提交/更新投票
 * POST /api/v1/votes
 * Body: { phone: string, vote: 'stopped' | 'valid' }
 * 
 * 安全规则：
 * - 手机号格式校验
 * - 单用户 1 分钟内最多 10 票（防刷）
 * - 同一用户对同一号码只能投一次（UPSERT 覆盖）
 */
router.post('/', requireAuth, async (req: any, res: any) => {
  console.log('=== SERVER VERSION: FIX-20260718-V2 ===');
  try {
    const { phone, vote } = req.body;
    const userId = req.userId;

    if (!phone || !vote) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 先规范化号码
    const normalizedPhone = normalizePhone(phone);

    // 服务号码检查优先（支持3位短号码如110、119等）
    if (isServiceNumber(normalizedPhone)) {
      return res.status(400).json({ error: '该号码是官方服务号码，不允许投票' });
    }

    // 手机号格式校验（3-20位）
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '手机号格式无效' });
    }

    if (!['stopped', 'valid'].includes(vote)) {
      return res.status(400).json({ error: '无效的投票类型' });
    }

    // 防刷检查：1 分钟内最多 10 票
    try {
      const rateCheck = await db.execute(sql`
        SELECT COUNT(*)::int as recent_count
        FROM number_votes
        WHERE user_id = ${userId}
          AND created_at > NOW() - INTERVAL '1 minute'
      `);
      const recentCount = (rateCheck as any[])?.[0]?.recent_count || 0;
      if (recentCount >= 10) {
        return res.status(429).json({ error: '投票过于频繁，每分钟最多 10 次', retry_after: 60 });
      }
    } catch (err: any) {
      if (err?.code !== '42P01') throw err; // 表不存在则跳过
    }

    // UPSERT 投票记录
    const result = await db.execute(sql`
      INSERT INTO number_votes (phone, user_id, vote)
      VALUES (${normalizedPhone}, ${userId}, ${vote})
      ON CONFLICT (phone, user_id) 
      DO UPDATE SET vote = ${vote}, updated_at = NOW()
      RETURNING id, phone, user_id, vote, created_at
    `);

    res.json({ success: true, data: (result as any[])?.[0] || null });
  } catch (error) {
    console.error('Vote submit error:', error);
    res.status(500).json({ error: '投票失败' });
  }
});

/**
 * 撤回投票
 * DELETE /api/v1/votes
 * Body: { phone: string }
 */
router.delete('/', requireAuth, async (req: any, res: any) => {
  try {
    const { phone } = req.body;
    const userId = req.userId;

    if (!phone) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '手机号格式无效' });
    }

    const normalizedPhone = normalizePhone(phone);

    // 服务号码不允许操作
    if (isServiceNumber(normalizedPhone)) {
      return res.status(400).json({ error: '该号码是官方服务号码，不允许操作' });
    }

    await db.execute(sql`
      DELETE FROM number_votes 
      WHERE phone = ${normalizedPhone} AND user_id = ${userId}
    `);

    res.json({ success: true });
  } catch (error) {
    console.error('Vote retract error:', error);
    res.status(500).json({ error: '撤回失败' });
  }
});

/**
 * 批量查询社区投票结果
 * POST /api/v1/votes/batch-query
 * Body: { phones: string[], user_id?: string }
 * Returns: { results: { phone, stopped_count, voter_count, community_status, has_change, display_name_hint, is_self_mark? }[] }
 * 
 * 社区状态计算（基于不同用户数）：
 * - 本人标记双重判定：如果 user_id 对应的用户有 active 的 number_changes，
 *   则对该用户返回 'confirmed_stopped'（即使只有1票）
 * - 不同用户投 stopped >= 3 → 'maybe_stopped' (疑似停用)
 * - 不同用户投 stopped >= 11 → 'confirmed_stopped' (确认停用)
 * - 无 stopped 投票 → null
 * 
 * 限制：单次最多 500 个号码
 */
router.post('/batch-query', async (req: any, res: any) => {
  try {
    const { phones, user_id } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: '缺少电话号码列表' });
    }

    // 限制单次查询数量：最多 500 个
    if (phones.length > 500) {
      return res.status(400).json({ error: '单次最多查询 500 个号码' });
    }

    // 过滤并标准化有效手机号，排除服务号码
    const validPhones = phones
      .filter((p: string) => isValidPhone(p))
      .map((p: string) => normalizePhone(p))
      .filter((p: string) => !isServiceNumber(p));

    if (validPhones.length === 0) {
      return res.json({ results: [] });
    }

    // 查询不同用户数（非总票数）
    // 使用 IN 子句，通过 sql.join 安全地传递数组参数
    // 30天过期：只统计30天内有更新的号码
    const votes = await db.execute(sql`
      SELECT phone, COUNT(DISTINCT user_id)::int as voter_count 
      FROM number_votes
      WHERE phone IN (
        ${sql.join(
          validPhones.map(phone => sql`${phone}`),
          sql`, `
        )}
      ) AND vote = 'stopped'
        AND updated_at > NOW() - INTERVAL '30 days'
      GROUP BY phone
    `);

    // 查询号码变更通知（active 且未过期）
    let changesMap = new Map<string, string>();
    // 查询当前用户的本人标记号码
    let selfMarkPhones = new Set<string>();
    try {
      const changes = await db.execute(sql`
        SELECT old_phone, display_name 
        FROM number_changes
        WHERE old_phone IN (
          ${sql.join(
            validPhones.map(phone => sql`${phone}`),
            sql`, `
          )}
        ) AND status = 'active'
          AND expires_at > NOW()
      `);
      for (const row of changes as any[]) {
        // 生成 display_name_hint：首字 + *
        const hint = row.display_name.length > 1 
          ? row.display_name[0] + '*' 
          : row.display_name;
        changesMap.set(row.old_phone, hint);
      }
    } catch (e) {
      // number_changes 表可能不存在，忽略错误
      console.log('number_changes table not found, skipping');
    }

    // 查询当前用户的本人标记
    if (user_id) {
      try {
        const selfMarks = await db.execute(sql`
          SELECT old_phone::TEXT
          FROM number_changes
          WHERE publisher_id = ${user_id}
            AND status = 'active'
            AND expires_at > NOW()
            AND old_phone IN (
              ${sql.join(
                validPhones.map(phone => sql`${phone}`),
                sql`, `
              )}
            )
        `);
        for (const row of (selfMarks as any[])) {
          selfMarkPhones.add(row.old_phone);
        }
      } catch (e) {
        // 忽略错误
      }
    }

    // 构建结果
    const voterMap = new Map<string, number>();
    for (const row of votes as any[]) {
      voterMap.set(row.phone, row.voter_count);
    }

    const results = [];
    for (const phone of validPhones) {
      const voterCount = voterMap.get(phone) || 0;
      const isSelfMark = selfMarkPhones.has(phone);
      let communityStatus: string | null = null;
      
      if (isSelfMark) {
        // 本人标记双重判定：对自己直接判定为"确认失效"
        communityStatus = 'confirmed_stopped';
      } else if (voterCount >= CONFIRMED_THRESHOLD) {
        communityStatus = 'confirmed_stopped';
      } else if (voterCount >= MAYBE_THRESHOLD) {
        communityStatus = 'maybe_stopped';
      }

      const hasChange = changesMap.has(phone);
      const displayNameHint = changesMap.get(phone) || null;
      
      const result: any = {
        phone,
        stopped_count: voterCount,
        voter_count: voterCount,
        community_status: communityStatus,
        has_change: hasChange,
        display_name_hint: displayNameHint,
      };
      if (isSelfMark) {
        result.is_self_mark = true;
      }
      results.push(result);
    }

    res.json({ results });
  } catch (error) {
    console.error('Batch query error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
