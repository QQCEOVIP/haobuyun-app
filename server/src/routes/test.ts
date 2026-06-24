import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router: Router = Router();

// 获取Supabase管理员客户端
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.COZE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(supabaseUrl, supabaseKey);
}

// 获取Supabase匿名客户端（用于登录验证）
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.COZE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || "";
  return createClient(supabaseUrl, supabaseKey);
}

// 初始化测试账号（需要服务密钥）
router.post('/init-test-account', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    
    const testEmail = 'test@haobuyun.app';
    const testPassword = 'test123456';
    
    // 先尝试删除已存在的测试账号
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const testUser = existingUsers?.users?.find(u => u.email === testEmail);
    
    if (testUser) {
      // 删除旧用户
      await supabase.auth.admin.deleteUser(testUser.id);
    }
    
    // 创建新测试账号
    const { data, error } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true, // 直接确认邮箱，无需验证
    });
    
    if (error) {
      console.error('创建测试账号失败:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
    
    console.log('测试账号创建成功:', data.user?.email);
    return res.status(200).json({ 
      success: true, 
      message: '测试账号初始化成功',
      email: testEmail,
      password: testPassword
    });
  } catch (err) {
    console.error('初始化测试账号异常:', err);
    return res.status(500).json({ success: false, message: '服务器异常' });
  }
});

// 测试账号登录（代理Supabase登录）
router.post('/test-login', async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const testEmail = 'test@haobuyun.app';
    const testPassword = 'test123456';
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    
    if (error) {
      console.error('测试账号登录失败:', error);
      return res.status(401).json({ success: false, message: error.message });
    }
    
    console.log('测试账号登录成功:', data.user?.email);
    return res.status(200).json({
      success: true,
      user: data.user,
      session: data.session,
    });
  } catch (err) {
    console.error('测试账号登录异常:', err);
    return res.status(500).json({ success: false, message: '服务器异常' });
  }
});


// 初始化管理员账号
router.post('/init-admin-account', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    const adminEmail = 'admin@haobuyun.app';
    const adminPassword = 'admin';

    // 先尝试删除已存在的管理员账号
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const adminUser = existingUsers?.users?.find(u => u.email === adminEmail);

    if (adminUser) {
      await supabase.auth.admin.deleteUser(adminUser.id);
    }

    // 创建管理员账号
    const { data, error } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (error) {
      console.error('创建管理员账号失败:', error);
      return res.status(500).json({ success: false, message: error.message });
    }

    console.log('管理员账号创建成功:', data.user?.email);
    return res.status(200).json({
      success: true,
      message: '管理员账号初始化成功',
      email: adminEmail,
      password: adminPassword,
    });
  } catch (err) {
    console.error('初始化管理员账号异常:', err);
    return res.status(500).json({ success: false, message: '服务器异常' });
  }
});

export default router;
