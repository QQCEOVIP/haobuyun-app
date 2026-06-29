import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pointsRouter from "./routes/points";
import contactsRouter from "./routes/contacts";
import profileRouter from "./routes/profile";
import backupRouter from "./routes/backup";
import feedbackRouter from "./routes/feedback";
import authRouter from "./routes/auth";
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

// 测试账号路由

// TODO: 扩展点预留 - 以下路由待接入广告/游戏后启用
// app.use('/api/v1/ads', adsRouter);    // 广告回调接口
// app.use('/api/v1/games', gameRouter); // 小游戏接口

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
