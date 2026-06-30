import { Router, type Router as RouterType } from 'express';
import { createClient } from '@supabase/supabase-js';

const router: RouterType = Router();

// Hardcoded correct Supabase URL
const SUPABASE_URL = 'https://br-jolly-cat-a3661c04.supabase2.aidap-global.cn-beijing.volces.com';

const getSupabaseAdmin = () => createClient(
  SUPABASE_URL,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BUCKET_NAME = 'backups';

// Helper: ensure bucket exists
const ensureBucket = async (supabase: ReturnType<typeof getSupabaseAdmin>) => {
  const { error } = await supabase.storage.createBucket(BUCKET_NAME, { public: false });
  // Ignore "already exists" error
  if (error && !error.message.includes('already exists')) {
    throw error;
  }
};

// POST /api/v1/backup/cloud - Upload backup
// Body: { fileName: string, content: string }
// Headers: x-user-id (required)
router.post('/cloud', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'Missing x-user-id header' });
    }
    const { fileName, content } = req.body;
    if (!fileName || !content) {
      return res.status(400).json({ error: 'Missing fileName or content' });
    }

    const supabase = getSupabaseAdmin();
    await ensureBucket(supabase);

    const storagePath = `${userId}/${fileName}`;
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, content, { contentType: 'application/json', upsert: true });

    if (error) throw error;

    res.json({ success: true, fileName });
  } catch (error: any) {
    console.error('Cloud backup upload error:', error?.message || error);
    res.status(500).json({ error: `Upload failed: ${error?.message || 'Unknown error'}` });
  }
});

// GET /api/v1/backup/cloud - List backup files for user
// Headers: x-user-id (required)
router.get('/cloud', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'Missing x-user-id header' });
    }

    const supabase = getSupabaseAdmin();
    const { data: files, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(userId, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) {
      // If bucket doesn't exist yet, return empty list
      if (error.message.includes('not found') || error.message.includes('Bucket not found')) {
        return res.json({ success: true, files: [] });
      }
      throw error;
    }

    res.json({ success: true, files: files || [] });
  } catch (error: any) {
    console.error('Cloud backup list error:', error?.message || error);
    res.status(500).json({ error: `List failed: ${error?.message || 'Unknown error'}` });
  }
});

// GET /api/v1/backup/cloud/download - Download a backup file
// Query: fileName (required)
// Headers: x-user-id (required)
router.get('/cloud/download', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'Missing x-user-id header' });
    }
    const fileName = req.query.fileName as string;
    if (!fileName) {
      return res.status(400).json({ error: 'Missing fileName query parameter' });
    }

    const supabase = getSupabaseAdmin();
    const storagePath = `${userId}/${fileName}`;
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(storagePath);

    if (error) throw error;
    if (!data) throw new Error('Download returned no data');

    const text = await data.text();
    res.json({ success: true, content: text });
  } catch (error: any) {
    console.error('Cloud backup download error:', error?.message || error);
    res.status(500).json({ error: `Download failed: ${error?.message || 'Unknown error'}` });
  }
});

// DELETE /api/v1/backup/cloud
// Headers: x-user-id (required)
// Body: { fileName: string }
router.delete('/cloud', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'Missing x-user-id header' });
    }
    const { fileName } = req.body;
    if (!fileName) {
      return res.status(400).json({ error: 'Missing fileName in body' });
    }

    const supabase = getSupabaseAdmin();
    const storagePath = `${userId}/${fileName}`;
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('Cloud backup delete error:', error?.message || error);
    res.status(500).json({ error: `Delete failed: ${error?.message || 'Unknown error'}` });
  }
});

export default router;
