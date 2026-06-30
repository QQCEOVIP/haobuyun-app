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

// 测试账号路由

// TODO: 扩展点预留 - 以下路由待接入广告/游戏后启用
// app.use('/api/v1/ads', adsRouter);    // 广告回调接口
// app.use('/api/v1/games', gameRouter); // 小游戏接口

// === Debug endpoint for environment check ===
const HARDCODED_SUPABASE_URL = 'https://br-jolly-cat-a3661c04.supabase2.aidap-global.cn-beijing.volces.com';
app.get('/api/v1/debug/env-check', async (req, res) => {
  const testClient = createClient(
    HARDCODED_SUPABASE_URL,
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || ''
  );
  const { data: testResult, error: testError } = await testClient.auth.admin.listUsers({ page: 1, perPage: 5 });
  
  res.json({
    hardcodedSupabaseUrl: HARDCODED_SUPABASE_URL,
    envSupabaseUrl: process.env.COZE_SUPABASE_URL || 'NOT SET (using hardcoded)',
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

// === serve client bundle ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDistPath));
app.get(/.*/, (req, res) => { res.sendFile(path.join(clientDistPath, "index.html")); });
// === end ===

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

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
