import express, { type Router, type Request, type Response } from 'express';
import { createClient, type User } from '@supabase/supabase-js';

const router: Router = express.Router();

// Hardcoded correct Supabase URL
const SUPABASE_URL = 'https://br-jolly-cat-a3661c04.supabase2.aidap-global.cn-beijing.volces.com';

// Supabase Admin client (using service role key to bypass RLS)
const supabaseAdmin = createClient(
  SUPABASE_URL,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Helper: Find user by email with pagination support
 * Supabase listUsers is paginated, so we need to iterate through all pages
 * Falls back to profiles table if admin API fails
 */
async function findUserByEmail(email: string): Promise<User | null> {
  console.log('[Auth] findUserByEmail: searching for email:', email);
  console.log('[Auth] SERVICE_ROLE_KEY set:', !!process.env.COZE_SUPABASE_SERVICE_ROLE_KEY);
  
  let page = 1;
  const perPage = 1000;
  let totalUsersChecked = 0;
  
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ 
      page, 
      perPage 
    });
    
    if (error) {
      console.error('[Auth] List users error on page', page, ':', error);
      // Fallback: try to find user by phone in profiles table
      const phoneFromEmail = email.split('@')[0];
      console.log('[Auth] Attempting fallback: query profiles table for phone:', phoneFromEmail);
      
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('user_id, phone')
        .eq('phone', phoneFromEmail)
        .single();
      
      if (profileError || !profileData) {
        console.log('[Auth] Fallback profiles query failed:', profileError?.message);
        return null;
      }
      
      // If we found a profile, get the user by ID
      console.log('[Auth] Found profile with user_id:', profileData.user_id);
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profileData.user_id);
      
      if (userError || !userData?.user) {
        console.log('[Auth] Fallback getUserById failed:', userError?.message);
        return null;
      }
      
      console.log('[Auth] Fallback succeeded, found user:', userData.user.email);
      return userData.user;
    }
    
    const users = data?.users || [];
    totalUsersChecked += users.length;
    console.log('[Auth] Page', page, '- found', users.length, 'users');
    
    const targetUser = users.find(u => u.email === email);
    
    if (targetUser) {
      console.log('[Auth] Found user on page', page, '- total checked:', totalUsersChecked);
      return targetUser;
    }
    
    // If we got fewer users than perPage, we've reached the end
    if (users.length < perPage) {
      break;
    }
    
    page++;
    
    // Safety limit to prevent infinite loops
    if (page > 100) {
      console.warn('[Auth] findUserByEmail: Reached page limit, stopping search');
      break;
    }
  }
  
  console.log('[Auth] User not found after checking', totalUsersChecked, 'users');
  return null;
}

/**
 * Helper: Compare ID card numbers
 * Supports both full match and last-4-digits match
 */
function compareIdCard(inputIdCard: string, storedIdCard: string): boolean {
  if (!inputIdCard || !storedIdCard) return false;
  
  // Full match
  if (inputIdCard === storedIdCard) return true;
  
  // Last 4 digits match (user might enter only last 4 digits)
  const inputLast4 = inputIdCard.length >= 4 ? inputIdCard.slice(-4) : inputIdCard;
  const storedLast4 = storedIdCard.length >= 4 ? storedIdCard.slice(-4) : storedIdCard;
  
  if (inputLast4 === storedLast4) return true;
  
  return false;
}

/**
 * POST /api/v1/auth/verify-identity
 * Verify phone + ID card (without resetting password)
 * Body: { phone: string, idCard: string }
 */
router.post('/verify-identity', async (req, res) => {
  try {
    const { phone, idCard } = req.body;
    console.log('[verify-identity] Request:', { phone, idCard: idCard ? idCard.substring(0, 4) + '****' : null });
    console.log('[verify-identity] Query condition:', { email: `${phone}@haobuyun.app` });
    console.log('[verify-identity] SUPABASE_URL:', SUPABASE_URL);
    console.log('[verify-identity] SERVICE_ROLE_KEY length:', (process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '').length);

    if (!phone || !idCard) {
      return res.status(400).json({ 
        success: false, 
        error: '缺少必要参数' 
      });
    }

    const email = `${phone}@haobuyun.app`;
    
    let targetUser: User | null;
    try {
      targetUser = await findUserByEmail(email);
    } catch (error) {
      console.error('[verify-identity] Find user error:', error);
      return res.status(500).json({ success: false, error: '查询用户失败' });
    }
    
    if (!targetUser) {
      console.log('[verify-identity] User not found for email:', email);
      // List all registered users for debugging
      const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
      console.log('[verify-identity] All registered users:', allUsers?.users?.map(u => ({
        email: u.email,
        phone: u.user_metadata?.phone,
        id_card: u.user_metadata?.id_card ? '****' + u.user_metadata.id_card.slice(-4) : null
      })));
      return res.status(404).json({ success: false, error: '该手机号未注册' });
    }

    console.log('[Auth] verify-identity: found user, checking id_card');
    const userIdCard = targetUser.user_metadata?.id_card;
    console.log('[verify-identity] Match check:', {
      inputIdCard: idCard,
      dbIdCard: userIdCard,
      fullMatch: idCard === userIdCard,
      last4Match: idCard?.slice(-4) === userIdCard?.slice(-4),
      compareIdCardResult: compareIdCard(idCard, userIdCard)
    });
    
    if (!compareIdCard(idCard, userIdCard)) {
      console.log('[verify-identity] id_card mismatch');
      return res.status(401).json({ success: false, error: '信息不匹配，请检查手机号和身份证号' });
    }

    console.log('[verify-identity] success');
    res.json({ success: true, message: '验证通过' });
  } catch (error) {
    console.error('[Auth] Verify identity error:', error);
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
    console.log('[Auth] forgot-password: phone=', phone, 'idCard length=', idCard?.length);

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
    console.log('[Auth] forgot-password: searching for email:', email);

    // Find user by email with pagination support
    let targetUser: User | null;
    try {
      targetUser = await findUserByEmail(email);
    } catch (error) {
      console.error('[Auth] Find user error:', error);
      return res.status(500).json({ 
        success: false, 
        error: '查询用户失败' 
      });
    }

    if (!targetUser) {
      console.log('[Auth] forgot-password: user not found for email:', email);
      return res.status(404).json({ 
        success: false, 
        error: '该手机号未注册' 
      });
    }

    console.log('[Auth] forgot-password: found user, checking id_card');
    // Verify ID card number from user metadata
    const userIdCard = targetUser.user_metadata?.id_card;
    console.log('[Auth] forgot-password: stored id_card length=', userIdCard?.length);
    
    if (!compareIdCard(idCard, userIdCard)) {
      console.log('[Auth] forgot-password: id_card mismatch');
      return res.status(401).json({ 
        success: false, 
        error: '信息不匹配，请检查手机号和身份证号' 
      });
    }

    // Update password using Admin API
    console.log('[Auth] forgot-password: updating password for user:', targetUser.id);
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUser.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('[Auth] Update password error:', updateError);
      return res.status(500).json({ 
        success: false, 
        error: '重置密码失败' 
      });
    }

    console.log('[Auth] forgot-password: success');
    res.json({ 
      success: true, 
      message: '密码重置成功' 
    });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
});

export default router;
