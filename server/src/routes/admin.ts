/**
 * 管理后台 API 路由
 * 提供用户管理、投票查询等功能
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { adminAuthMiddleware, adminLoginHandler, adminMeHandler, AdminRequest } from '../adminAuth';

const router: Router = Router();

// Supabase 配置
const SUPABASE_URL = process.env.COZE_SUPABASE_URL || 'https://br-slick-peep-6b368f8f.supabase2.aidap-global.cn-beijing.volces.com';
const SUPABASE_SERVICE_ROLE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '';

// 创建 Supabase Admin 客户端
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// ==================== 公开接口 ====================

// 管理员登录
router.post('/login', adminLoginHandler);

// ==================== 需要认证的接口 ====================

// 获取当前管理员信息
router.get('/me', adminAuthMiddleware, adminMeHandler);

// ==================== 投票明细查询 ====================

// 获取投票记录（按号码聚合）
router.get('/votes', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, phone } = req.query;

    // 获取所有投票记录进行聚合
    let query = supabaseAdmin
      .from('number_votes')
      .select('phone, vote, user_id');

    if (phone) {
      query = query.eq('phone', phone);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 按号码聚合统计
    const statsMap: Record<string, { valid_count: number; stopped_count: number; user_ids: Set<string> }> = {};
    
    for (const row of data || []) {
      if (!statsMap[row.phone]) {
        statsMap[row.phone] = { valid_count: 0, stopped_count: 0, user_ids: new Set() };
      }
      statsMap[row.phone].user_ids.add(row.user_id);
      if (row.vote === 'valid') {
        statsMap[row.phone].valid_count++;
      } else if (row.vote === 'stopped') {
        statsMap[row.phone].stopped_count++;
      }
    }

    // 转换为数组并计算状态
    let result = Object.entries(statsMap).map(([phone, stats]) => {
      const unique_users = stats.user_ids.size;
      let status = '正常';
      if (stats.stopped_count >= 11) {
        status = '确认停用';
      } else if (stats.stopped_count >= 3) {
        status = '疑似停用';
      }
      return {
        phone,
        valid_count: stats.valid_count,
        stopped_count: stats.stopped_count,
        unique_users,
        status
      };
    });

    // 按总票数排序
    result.sort((a, b) => (b.valid_count + b.stopped_count) - (a.valid_count + a.stopped_count));

    // 分页
    const total = result.length;
    const offset = (Number(page) - 1) * Number(limit);
    result = result.slice(offset, offset + Number(limit));

    res.json({
      success: true,
      data: result,
      total,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err: any) {
    console.error('获取投票记录失败:', err);
    res.status(500).json({ error: '获取投票记录失败', detail: err.message });
  }
});

// 获取号码的投票统计
router.get('/votes/stats', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('number_votes')
      .select('phone, vote');

    if (error) throw error;

    // 统计每个号码的投票情况
    const stats: Record<string, { stopped: number; normal: number; total: number }> = {};
    for (const row of data || []) {
      if (!stats[row.phone]) {
        stats[row.phone] = { stopped: 0, normal: 0, total: 0 };
      }
      stats[row.phone].total++;
      if (row.vote === 'stopped') stats[row.phone].stopped++;
      if (row.vote === 'normal') stats[row.phone].normal++;
    }

    // 转换为数组并排序
    const result = Object.entries(stats)
      .map(([phone, s]) => ({ phone, ...s }))
      .sort((a, b) => b.total - a.total);

    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('获取投票统计失败:', err);
    res.status(500).json({ error: '获取投票统计失败', detail: err.message });
  }
});

// ==================== 用户管理 ====================

// 获取用户列表
router.get('/users', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, search } = req.query;

    // 使用 Supabase Admin API 获取用户列表
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;

    let users = data.users || [];

    // 搜索过滤
    if (search) {
      const keyword = String(search).toLowerCase();
      users = users.filter(u =>
        u.email?.toLowerCase().includes(keyword) ||
        u.id?.toLowerCase().includes(keyword) ||
        u.user_metadata?.phone?.includes(keyword)
      );
    }

    // 分页
    const total = users.length;
    const offset = (Number(page) - 1) * Number(limit);
    users = users.slice(offset, offset + Number(limit));

    res.json({
      success: true,
      data: users.map(u => ({
        id: u.id,
        email: u.email,
        phone: u.user_metadata?.phone || '',
        id_card: u.user_metadata?.id_card ? '****' + u.user_metadata.id_card.slice(-4) : '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        banned: u.user_metadata?.banned || false,
        ban_reason: u.user_metadata?.ban_reason || ''
      })),
      total,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err: any) {
    console.error('获取用户列表失败:', err);
    res.status(500).json({ error: '获取用户列表失败', detail: err.message });
  }
});

// 获取单个用户详情
router.get('/users/:userId', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) throw error;
    if (!data.user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = data.user;
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        phone: user.user_metadata?.phone || '',
        id_card: user.user_metadata?.id_card ? '****' + user.user_metadata.id_card.slice(-4) : '',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        banned: user.user_metadata?.banned || false,
        ban_reason: user.user_metadata?.ban_reason || '',
        raw_metadata: user.user_metadata
      }
    });
  } catch (err: any) {
    console.error('获取用户详情失败:', err);
    res.status(500).json({ error: '获取用户详情失败', detail: err.message });
  }
});

// 封禁用户
router.post('/users/:userId/ban', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const { reason } = req.body;

    // 获取当前用户信息
    const { data: userData, error: getError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (getError || !userData.user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 更新用户元数据，添加封禁标记
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...userData.user.user_metadata,
        banned: true,
        ban_reason: reason || '管理员封禁',
        banned_at: new Date().toISOString()
      }
    });

    if (updateError) throw updateError;

    res.json({ success: true, message: '用户已封禁' });
  } catch (err: any) {
    console.error('封禁用户失败:', err);
    res.status(500).json({ error: '封禁用户失败', detail: err.message });
  }
});

// 解封用户
router.post('/users/:userId/unban', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;

    // 获取当前用户信息
    const { data: userData, error: getError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (getError || !userData.user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 更新用户元数据，移除封禁标记
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...userData.user.user_metadata,
        banned: false,
        ban_reason: '',
        banned_at: null
      }
    });

    if (updateError) throw updateError;

    res.json({ success: true, message: '用户已解封' });
  } catch (err: any) {
    console.error('解封用户失败:', err);
    res.status(500).json({ error: '解封用户失败', detail: err.message });
  }
});

// 重置用户密码
router.post('/users/:userId/reset-password', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6位' });
    }

    // 检查用户是否存在
    const { data: userData, error: getError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (getError || !userData.user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 更新密码
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (updateError) throw updateError;

    res.json({ success: true, message: '密码已重置' });
  } catch (err: any) {
    console.error('重置密码失败:', err);
    res.status(500).json({ error: '重置密码失败', detail: err.message });
  }
});

export default router;
