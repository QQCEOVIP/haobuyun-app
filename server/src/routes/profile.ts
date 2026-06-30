import { Router, type Router as RouterType } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { S3Storage } from 'coze-coding-dev-sdk';

const router: RouterType = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: process.env.COZE_BUCKET_ACCESS_KEY || '',
  secretKey: process.env.COZE_BUCKET_SECRET_KEY || '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// Hardcoded correct Supabase URL
const SUPABASE_URL = 'https://br-jolly-cat-a3661c04.supabase2.aidap-global.cn-beijing.volces.com';

const getSupabaseAdmin = () => createClient(
  SUPABASE_URL,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// POST /api/v1/profile/avatar - Upload avatar
// Body: FormData with 'avatar' field (image file)
// Headers: x-user-id (required)
router.post('/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'Missing x-user-id header' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const fileName = `avatars/${userId}_${Date.now()}.${ext}`;

    const fileKey = await storage.uploadFile({
      fileContent: req.file.buffer,
      fileName,
      contentType: req.file.mimetype,
    });

    const avatarUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 2592000, // 30 days
    });

    // Update user metadata in Supabase (optional - skip if userId is not valid UUID)
    try {
      const supabase = getSupabaseAdmin();
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { avatar_url: avatarUrl, avatar_key: fileKey },
      });
    } catch (metaError: any) {
      console.warn('Failed to update user metadata:', metaError?.message);
      // Continue anyway - avatar was uploaded successfully
    }

    res.json({ success: true, avatarUrl: avatarUrl, avatar_key: fileKey });
  } catch (error: any) {
    console.error('Upload avatar error:', error?.message || error);
    res.status(500).json({ error: `Upload failed: ${error?.message || 'Unknown error'}` });
  }
});

// GET /api/v1/profile - Get user profile
// Headers: x-user-id (required)
router.get('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'Missing x-user-id header' });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !userData?.user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const metadata = userData.user.user_metadata || {};

    // Regenerate presigned URL from avatar_key to avoid expired URLs
    let avatarUrl: string | null = null;
    if (metadata.avatar_key) {
      try {
        avatarUrl = await storage.generatePresignedUrl({
          key: metadata.avatar_key,
          expireTime: 2592000, // 30 days
        });
      } catch (urlError: any) {
        console.warn('Failed to generate presigned URL:', urlError?.message);
        // Fallback to stored URL if regeneration fails
        avatarUrl = metadata.avatar_url || null;
      }
    }

    res.json({
      success: true,
      profile: {
        id: userData.user.id,
        email: userData.user.email,
        nickname: metadata.nickname || '',
        avatar_url: avatarUrl,
        avatar_key: metadata.avatar_key || null,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

export default router;
