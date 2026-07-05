import { Router, type Router as RouterType } from 'express';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import multer from 'multer';

const router: RouterType = Router();

// 配置文件上传（内存存储，限制5MB）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Use environment variable for Supabase URL
const SUPABASE_URL = process.env.COZE_SUPABASE_URL || '';

const getSupabaseAdmin = () => createClient(
  SUPABASE_URL,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// POST /api/v1/feedback
// Body (multipart/form-data):
//   - category: string
//   - content: string
//   - contact?: string
//   - userId: string
//   - screenshot?: File (图片文件)
router.post('/', upload.single('screenshot'), async (req, res) => {
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
      // SMTP 配置：优先使用环境变量，否则使用默认值
      const smtpHost = process.env.SMTP_HOST || 'smtp.qq.com';
      const smtpPort = parseInt(process.env.SMTP_PORT || '465');
      const smtpUser = process.env.SMTP_USER || 'vip2012@vip.qq.com';
      const smtpPass = process.env.SMTP_PASS || 'efhdilrncezucaab'; // 临时默认值，待配置环境变量后移除
      const feedbackTo = process.env.FEEDBACK_TO || 'vip2012@vip.qq.com';

      if (smtpPass) {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        // 准备邮件内容
        const mailOptions: nodemailer.SendMailOptions = {
          from: `"号簿云反馈" <${smtpUser}>`,
          to: feedbackTo,
          subject: `新反馈 - ${category || '建议'}`,
          html: `
            <h2>用户反馈</h2>
            <p><strong>分类：</strong>${category || '建议'}</p>
            <p><strong>内容：</strong></p>
            <blockquote>${content.trim()}</blockquote>
            <p><strong>联系方式：</strong>${contact?.trim() || '未提供'}</p>
            <p><strong>用户ID：</strong>${userId}</p>
            <p><strong>时间：</strong>${new Date().toLocaleString('zh-CN')}</p>
            ${req.file ? '<p><strong>附件：</strong>截图已作为附件发送</p>' : ''}
          `,
        };

        // 如果有截图，添加为附件
        if (req.file) {
          mailOptions.attachments = [
            {
              filename: 'feedback_screenshot.jpg',
              content: req.file.buffer,
              contentType: req.file.mimetype,
            },
          ];
        }

        await transporter.sendMail(mailOptions);
        console.log('Feedback email sent successfully');
      } else {
        console.warn('Feedback saved (email skipped - SMTP_PASS not configured in environment variables)');
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

// multer 错误处理
router.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '文件大小超过限制（最大 5MB）' });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
