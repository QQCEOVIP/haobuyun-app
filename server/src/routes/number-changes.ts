import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { db } from '../storage/database';
import { sql } from 'drizzle-orm';
import { isValidPhone, normalizePhone, isServiceNumber } from '../middleware/rate-limit.js';

const router: any = Router();

// 创建 Supabase Admin 客户端
const SUPABASE_URL = process.env.COZE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// 内存存储：验证请求频率限制
const verifyRequestCounts = new Map<string, { count: number; resetAt: number }>();

function checkVerifyRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = verifyRequestCounts.get(userId);
  
  if (!record || now > record.resetAt) {
    verifyRequestCounts.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (record.count >= 10) {
    return false;
  }
  
  record.count++;
  return true;
}

// 生成称呼提示（首字+*号）
function generateDisplayNameHint(displayName: string): string {
  if (!displayName || displayName.length === 0) return '';
  if (displayName.length === 1) return displayName;
  return displayName.charAt(0) + '*';
}

// POST /api/v1/number-changes - 创建变更通知
router.post('/', async (req: any, res: any) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const { old_phone, new_phone, display_name, remark, disclaimer_agreed, id_card, expire_days } = req.body;

    // 1. 验证免责声明同意
    if (disclaimer_agreed !== true) {
      return res.status(400).json({ error: '请先阅读并同意免责声明' });
    }

    // 2. 验证必填字段
    if (!old_phone || !new_phone || !display_name) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    // 3. 手机号规范化
    const normalizedOld = normalizePhone(old_phone);
    const normalizedNew = normalizePhone(new_phone);

    // 4. 服务号码检查（最先执行，优先于其他业务校验）
    if (isServiceNumber(normalizedOld)) {
      return res.status(400).json({ error: '该号码是官方服务号码，不允许发布变更通知' });
    }

    if (isServiceNumber(normalizedNew)) {
      return res.status(400).json({ error: '新号码是官方服务号码，不允许发布变更通知' });
    }

    // 5. 手机号格式校验
    if (!isValidPhone(normalizedOld)) {
      return res.status(400).json({ error: '旧手机号格式无效' });
    }

    if (!isValidPhone(normalizedNew)) {
      return res.status(400).json({ error: '新手机号格式无效' });
    }

    // 6. 验证 display_name 长度
    if (display_name.length < 2 || display_name.length > 20) {
      return res.status(400).json({ error: '称呼长度必须在2-20个字符之间' });
    }

    // 7. 验证 expire_days（只接受 30/90/180/360）
    const validExpireDays = [30, 90, 180, 360];
    const finalExpireDays = expire_days || 90;
    if (!validExpireDays.includes(finalExpireDays)) {
      return res.status(400).json({ error: '保留期限只能是30、90、180或360天' });
    }

    // 8. 身份证验证（仅当用户提供 id_card 时才验证）
    if (id_card) {
      const { data: authUserData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);

      if (authError || !authUserData?.user) {
        console.error('[number-changes] User lookup error:', authError);
        return res.status(400).json({ error: '无法获取用户信息' });
      }

      const storedIdCard = authUserData.user.user_metadata?.id_card;
      if (!storedIdCard) {
        console.error('[number-changes] User has no id_card in metadata, userId:', userId);
        return res.status(400).json({ error: '您的账户未绑定身份证信息，请先完成实名认证' });
      }

      if (id_card !== storedIdCard) {
        return res.status(400).json({ error: '身份证号码与注册信息不一致' });
      }
    }

    // 9. 生成 name_hash
    const nameHash = await bcrypt.hash(display_name, 12);

    // 10. 计算过期时间
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + finalExpireDays);

    // 11. 如果已有 active 记录，先 revoke
    await supabaseAdmin
      .from('number_changes')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('old_phone', normalizedOld)
      .eq('status', 'active');

    // 12. 插入新记录
    const { data, error } = await supabaseAdmin
      .from('number_changes')
      .insert({
        old_phone: normalizedOld,
        new_phone: normalizedNew,
        publisher_id: userId,
        display_name,
        name_hash: nameHash,
        remark: remark || '',
        status: 'active',
        expire_days: finalExpireDays,
        expires_at: expiresAt.toISOString(),
      })
      .select('id, old_phone, status, expires_at')
      .single();

    if (error) {
      console.error('[number-changes] Insert error:', error);
      return res.status(500).json({ error: '创建失败' });
    }

    // 13. 同时往 number_votes 插入一条 "stopped" 投票
    // 本人标记 = 投1票停用，进入投票统计体系
    try {
      await db.execute(sql`
        INSERT INTO number_votes (phone, user_id, vote)
        VALUES (${normalizedOld}, ${userId}, 'stopped')
        ON CONFLICT (phone, user_id) 
        DO UPDATE SET vote = 'stopped', updated_at = NOW()
      `);
      console.log(`[number-changes] Vote inserted: phone=${normalizedOld}, user=${userId}, vote=stopped`);
    } catch (voteErr) {
      // 投票写入失败不影响主流程，仅记录日志
      console.error('[number-changes] Vote insert error (non-fatal):', voteErr);
    }

    console.log(`[number-changes] Created: old_phone=${normalizedOld}, publisher=${userId}`);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[number-changes] Create error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/v1/number-changes/verify - 验证查看
router.post('/verify', async (req: any, res: any) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    // 防刷限制
    if (!checkVerifyRateLimit(userId)) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }

    const { old_phone, input_name } = req.body;

    if (!old_phone || !input_name) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const normalizedPhone = normalizePhone(old_phone);

    // 查找 active 且未过期的记录
    const { data: record, error } = await supabaseAdmin
      .from('number_changes')
      .select('id, new_phone, remark, name_hash, created_at')
      .eq('old_phone', normalizedPhone)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !record) {
      return res.json({ verified: false, message: '未找到该号码的变更记录' });
    }

    // 验证称呼
    const match = await bcrypt.compare(input_name, record.name_hash);

    if (!match) {
      console.log(`[number-changes] Verify failed: old_phone=${normalizedPhone}, user=${userId}`);
      return res.json({ verified: false, message: '称呼不匹配，无法查看' });
    }

    console.log(`[number-changes] Verify success: old_phone=${normalizedPhone}, user=${userId}`);
    return res.json({
      verified: true,
      data: {
        new_phone: record.new_phone,
        remark: record.remark,
        changed_at: record.created_at,
      },
    });
  } catch (err) {
    console.error('[number-changes] Verify error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/v1/number-changes/batch-check - 批量查询
router.post('/batch-check', async (req: any, res: any) => {
  try {
    const { phones } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      return res.json({ results: [] });
    }

    // 过滤服务号码
    const validPhones = phones
      .map((p: string) => normalizePhone(p))
      .filter((p: string) => isValidPhone(p) && !isServiceNumber(p));

    if (validPhones.length === 0) {
      return res.json({ results: [] });
    }

    // 去重
    const uniquePhones = [...new Set(validPhones)];

    // 查询 active 且未过期的记录
    const { data, error } = await supabaseAdmin
      .from('number_changes')
      .select('old_phone, display_name')
      .in('old_phone', uniquePhones)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.error('[number-changes] Batch check error:', error);
      return res.status(500).json({ error: '查询失败' });
    }

    // 构建结果
    const changeMap = new Map<string, string>();
    if (data) {
      for (const record of data) {
        changeMap.set(record.old_phone, record.display_name);
      }
    }

    const results = uniquePhones.map((phone: string) => {
      const displayName = changeMap.get(phone);
      return {
        phone,
        has_change: !!displayName,
        display_name_hint: displayName ? generateDisplayNameHint(displayName) : null,
      };
    });

    return res.json({ results });
  } catch (err) {
    console.error('[number-changes] Batch check error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/v1/number-changes - 撤回
router.delete('/', async (req: any, res: any) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: '未授权' });
    }

    const { old_phone } = req.body;

    if (!old_phone) {
      return res.status(400).json({ error: '缺少 old_phone 参数' });
    }

    const normalizedPhone = normalizePhone(old_phone);

    // 只能撤回自己发布的变更
    const { error } = await supabaseAdmin
      .from('number_changes')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('old_phone', normalizedPhone)
      .eq('publisher_id', userId)
      .eq('status', 'active');

    if (error) {
      console.error('[number-changes] Revoke error:', error);
      return res.status(500).json({ error: '撤回失败' });
    }

    // 同时删除对应的投票
    try {
      await db.execute(sql`
        DELETE FROM number_votes 
        WHERE phone = ${normalizedPhone} AND user_id = ${userId}
      `);
      console.log(`[number-changes] Vote removed: phone=${normalizedPhone}, user=${userId}`);
    } catch (voteErr) {
      console.error('[number-changes] Vote delete error (non-fatal):', voteErr);
    }

    console.log(`[number-changes] Revoked: old_phone=${normalizedPhone}, user=${userId}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('[number-changes] Revoke error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

export default router;
