import { Router, type Router as RouterType } from 'express';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const router: RouterType = Router();

// Hardcoded correct Supabase URL
const SUPABASE_URL = 'https://br-jolly-cat-a3661c04.supabase2.aidap-global.cn-beijing.volces.com';

const getSupabaseAdmin = () => createClient(
  SUPABASE_URL,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// POST /api/v1/feedback
// Body: { category: string, content: string, contact?: string, userId: string }
router.post('/', async (req, res) => {
  try {
    const { category, content, contact, userId } = req.body;

    if (!content || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert feedback into Supabase
    const supabase = getSupabaseAdmin();
    const { error: insertError } = await supabase.from('feedback').insert({
      user_id: userId,
      category: category || 'suggestion',
      content: content.trim(),
      contact: contact?.trim() || null,
    });

    if (insertError) {
      console.error('Feedback insert error:', insertError.message);
      return res.status(500).json({ error: 'Failed to save feedback' });
    }

    // Try to send email notification
    try {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT || '587';
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpHost && smtpUser && smtpPass) {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort),
          secure: smtpPort === '465',
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: `"号簿云反馈" <${smtpUser}>`,
          to: 'vip2012@vip.qq.com',
          subject: `新反馈 - ${category || '建议'}`,
          html: `
            <h2>用户反馈</h2>
            <p><strong>分类：</strong>${category || '建议'}</p>
            <p><strong>内容：</strong></p>
            <blockquote>${content.trim()}</blockquote>
            <p><strong>联系方式：</strong>${contact?.trim() || '未提供'}</p>
            <p><strong>用户ID：</strong>${userId}</p>
            <p><strong>时间：</strong>${new Date().toLocaleString('zh-CN')}</p>
          `,
        });
        console.log('Feedback email sent successfully');
      } else {
        console.log('Feedback saved (email notification skipped - SMTP not configured)');
      }
    } catch (emailError: any) {
      console.warn('Failed to send feedback email:', emailError.message);
      // Email failure is not critical, feedback is already saved
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Feedback submit error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
