import express, { type Router, type Request, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router: Router = express.Router();

// Supabase Admin client (using service role key to bypass RLS)
const supabaseAdmin = createClient(
  process.env.COZE_SUPABASE_URL || '',
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * POST /api/v1/auth/verify-identity
 * Verify phone + ID card (without resetting password)
 * Body: { phone: string, idCard: string }
 */
router.post('/verify-identity', async (req, res) => {
  try {
    const { phone, idCard } = req.body;

    if (!phone || !idCard) {
      return res.status(400).json({ 
        success: false, 
        error: '缺少必要参数' 
      });
    }

    const email = `${phone}@haobuyun.app`;
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('List users error:', listError);
      return res.status(500).json({ success: false, error: '查询用户失败' });
    }

    const targetUser = users?.users?.find(u => u.email === email);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: '该手机号未注册' });
    }

    const userIdCard = targetUser.user_metadata?.id_card;
    if (!userIdCard || userIdCard !== idCard) {
      return res.status(401).json({ success: false, error: '信息不匹配，请检查手机号和身份证号' });
    }

    res.json({ success: true, message: '验证通过' });
  } catch (error) {
    console.error('Verify identity error:', error);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Verify phone + ID card and reset password
 * Body: { phone: string, idCard: string, newPassword: string }
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { phone, idCard, newPassword } = req.body;

    if (!phone || !idCard || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: '缺少必要参数' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: '新密码长度至少6位' 
      });
    }

    // Construct email from phone
    const email = `${phone}@haobuyun.app`;

    // Find user by email using Admin API
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('List users error:', listError);
      return res.status(500).json({ 
        success: false, 
        error: '查询用户失败' 
      });
    }

    // Find user with matching email
    const targetUser = users?.users?.find(u => u.email === email);

    if (!targetUser) {
      return res.status(404).json({ 
        success: false, 
        error: '该手机号未注册' 
      });
    }

    // Verify ID card number from user metadata
    const userIdCard = targetUser.user_metadata?.id_card;
    
    if (!userIdCard || userIdCard !== idCard) {
      return res.status(401).json({ 
        success: false, 
        error: '信息不匹配，请检查手机号和身份证号' 
      });
    }

    // Update password using Admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUser.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Update password error:', updateError);
      return res.status(500).json({ 
        success: false, 
        error: '重置密码失败' 
      });
    }

    res.json({ 
      success: true, 
      message: '密码重置成功' 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

export default router;
