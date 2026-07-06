import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js';
import pointsRouter from "./routes/points";
import contactsRouter from "./routes/contacts";
import profileRouter from "./routes/profile";
import backupRouter from "./routes/backup";
import feedbackRouter from "./routes/feedback";
import authRouter from "./routes/auth";
import votesRouter from "./routes/votes";
import detectRouter from "./routes/detect";
import authenticateRouter from "./routes/authenticate";
import numberStatusRouter from "./routes/number-status";
// TODO: 扩展点预留 - 广告和游戏路由
// import adsRouter from "./routes/ads";    // 广告回调 (AdMob/穿山甲/优量汇)
// import gameRouter from "./routes/game";  // 小游戏 (H5/外部渠道)

const app = express();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// === Environment integrity verification (hbyun-watermark-v1) ===
// 验证运行环境是否与预设的包名和域名匹配，用于防盗版追踪
const HBYUN_EXPECTED_PACKAGE = 'com.haobuyun.app';
const HBYUN_EXPECTED_ORIGIN = 'haobuyun.app';
const HBYUN_SIGNATURE_SALT = 'hbyun_sig_2026_q2_vault';

function generateEnvSignature(packageName: string, origin: string): string {
  const combined = `${packageName}:${origin}:${HBYUN_SIGNATURE_SALT}`;
  let hash = 0x7e3a9b1c;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
  }
  return `hbyun_${Math.abs(hash).toString(36)}_${packageName.split('.').pop()}`;
}

app.post('/api/v1/verify-env', (req, res) => {
  const { packageName, origin, appSignature } = req.body || {};
  const expectedSignature = generateEnvSignature(HBYUN_EXPECTED_PACKAGE, HBYUN_EXPECTED_ORIGIN);
  const clientSignature = generateEnvSignature(packageName || '', origin || '');
  const match = clientSignature === expectedSignature && appSignature === expectedSignature;
  
  // 静默记录不匹配的请求（可能是盗版）
  if (!match) {
    console.warn(`[hbyun-verify] Mismatch detected: pkg=${packageName}, origin=${origin}, sig=${appSignature}`);
  }
  
  res.json({
    verified: match,
    serverSignature: expectedSignature,
    timestamp: new Date().toISOString(),
  });
});

// 积分体系路由
app.use('/api/v1/points', pointsRouter);

// 通讯录管理路由
app.use('/api/v1/contacts', contactsRouter);

// 用户资料路由
app.use('/api/v1/profile', profileRouter);

// 云端备份路由
app.use('/api/v1/backup', backupRouter);
app.use('/api/v1/feedback', feedbackRouter);
app.use('/api/v1/auth', authRouter);

// 号码状态投票路由
app.use('/api/v1/votes', votesRouter);

// 号码状态检测路由
app.use('/api/v1/detect', detectRouter);

// 号码认证路由
app.use('/api/v1/authenticate', authenticateRouter);

// 号码状态查询路由
app.use('/api/v1/number-status', numberStatusRouter);

// 测试账号路由

// TODO: 扩展点预留 - 以下路由待接入广告/游戏后启用
// app.use('/api/v1/ads', adsRouter);    // 广告回调接口
// app.use('/api/v1/games', gameRouter); // 小游戏接口

// === Debug endpoint for environment check ===
app.get('/api/v1/debug/env-check', async (req, res) => {
  const testClient = createClient(
    process.env.COZE_SUPABASE_URL || '',
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || ''
  );
  const { data: testResult, error: testError } = await testClient.auth.admin.listUsers({ page: 1, perPage: 5 });
  
  res.json({
    envSupabaseUrl: process.env.COZE_SUPABASE_URL || 'NOT SET',
    hasServiceRoleKey: !!process.env.COZE_SUPABASE_SERVICE_ROLE_KEY,
    serviceRoleKeyLength: (process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || '').length,
    anonKeyValue: process.env.COZE_SUPABASE_ANON_KEY,
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('COZE')),
    dbTest: {
      success: !testError,
      error: testError?.message || null,
      userCount: testResult?.users?.length || 0,
      userEmails: testResult?.users?.map(u => u.email) || []
    }
  });
});

// === Debug endpoints (must be before static file serving) ===
app.get('/api/v1/debug/show-keys', (req, res) => {
  res.json({
    supabaseUrl: process.env.COZE_SUPABASE_URL,
    serviceRoleKey: process.env.COZE_SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.COZE_SUPABASE_ANON_KEY
  });
});

app.post('/api/v1/debug/create-user', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(
      process.env.COZE_SUPABASE_URL || '',
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || ''
    );
    const { data, error } = await db.auth.admin.createUser({
      email: '15977355155@haobuyun.app',
      password: 'Haobuyun@2026',
      email_confirm: true,
      user_metadata: { phone: '15977355155', id_card: '450327198812170459' }
    });
    if (error) {
      res.json({ success: false, error: error.message });
    } else {
      res.json({ success: true, userId: data.user?.id, email: data.user?.email });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/v1/debug/lookup-user', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(
      process.env.COZE_SUPABASE_URL || '',
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || ''
    );
    
    // List all users
    const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) {
      return res.json({ success: false, error: error.message });
    }
    
    const users = (data?.users || []).map(u => ({
      email: u.email,
      phone: u.user_metadata?.phone,
      id_card: u.user_metadata?.id_card,
      created_at: u.created_at
    }));
    
    // Also specifically look for the target user
    const target = (data?.users || []).find(u => u.email === '15977355155@haobuyun.app');
    const targetDetail = target ? {
      email: target.email,
      phone: target.user_metadata?.phone,
      id_card: target.user_metadata?.id_card,
      id_card_length: target.user_metadata?.id_card?.length,
      all_metadata: target.user_metadata,
      created_at: target.created_at
    } : null;
    
    res.json({ 
      success: true, 
      totalUsers: users.length, 
      allUsers: users,
      targetUser: targetDetail
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Debug endpoint: test verify-identity logic
app.post('/api/v1/debug/test-verify', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(
      process.env.COZE_SUPABASE_URL || '',
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || ''
    );
    
    // Try the exact same thing findUserByEmail does
    const email = '15977355155@haobuyun.app';
    
    let page = 1;
    let found = null;
    let allEmails = [];
    
    while (page <= 5) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
      if (error) {
        return res.json({ success: false, error: error.message, step: 'listUsers', page });
      }
      const users = data?.users || [];
      allEmails.push(...users.map(u => u.email));
      
      const match = users.find(u => u.email === email);
      if (match) {
        found = { email: match.email, id_card: match.user_metadata?.id_card, phone: match.user_metadata?.phone };
        break;
      }
      if (users.length < 100) break;
      page++;
    }
    
    res.json({
      success: true,
      email,
      found: !!found,
      foundUser: found,
      totalEmails: allEmails.length,
      allEmails
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Debug endpoint: seed user to production database
app.post('/api/v1/debug/seed-user', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    // Use PRODUCTION database (from env var)
    const db = createClient(
      process.env.COZE_SUPABASE_URL || '',
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || ''
    );
    
    const { data, error } = await db.auth.admin.createUser({
      email: '15977355155@haobuyun.app',
      password: 'Aa123456',
      email_confirm: true,
      user_metadata: { phone: '15977355155', id_card: '450327198812170459' }
    });
    
    if (error) {
      // If user already exists, try to get them and update metadata
      if (error.message.includes('already')) {
        const { data: listData } = await db.auth.admin.listUsers({ page: 1, perPage: 100 });
        const existing = listData?.users?.find(u => u.email === '15977355155@haobuyun.app');
        if (existing) {
          return res.json({ 
            success: true, 
            message: 'User already exists in production', 
            userId: existing.id,
            metadata: existing.user_metadata 
          });
        }
      }
      return res.json({ success: false, error: error.message });
    }
    
    res.json({ success: true, userId: data.user?.id, email: data.user?.email });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Debug endpoint: backup info
app.get('/api/v1/debug/backup-info', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(
      process.env.COZE_SUPABASE_URL || '',
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || ''
    );
    
    // List all storage buckets
    const { data: buckets, error: bucketError } = await db.storage.listBuckets();
    
    // List files in backups bucket
    let backupFiles = [];
    if (!bucketError) {
      const backupsBucket = buckets?.find(b => b.name === 'backups');
      if (backupsBucket) {
        // List top-level folders (user IDs)
        const { data: folders } = await db.storage.from('backups').list('', { limit: 100 });
        if (folders) {
          for (const folder of folders.slice(0, 5)) {
            const { data: files } = await db.storage.from('backups').list(folder.name, { limit: 10 });
            backupFiles.push({ userId: folder.name, files: files || [] });
          }
        }
      }
    }
    
    // Check backups table
    let tableData = null;
    const { data: rows, error: tableError } = await db
      .from('backups')
      .select('id, user_id, contact_count, backup_type, created_at')
      .limit(20);
    if (!tableError) {
      tableData = { count: rows?.length || 0, rows };
    } else {
      tableData = { error: tableError.message };
    }
    
    res.json({
      supabaseUrl: process.env.COZE_SUPABASE_URL,
      buckets: buckets?.map(b => ({ name: b.name, public: b.public })) || [],
      bucketError: bucketError?.message,
      backupFiles,
      backupsTable: tableData
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// === serve client bundle ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDistPath));
app.get(/.*/, (req, res) => { res.sendFile(path.join(clientDistPath, "index.html")); });
// === end ===

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
