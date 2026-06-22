import express from "express";
import cors from "cors";
import pointsRouter from "./routes/points";
import contactsRouter from "./routes/contacts";
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

// TODO: 扩展点预留 - 以下路由待接入广告/游戏后启用
// app.use('/api/v1/ads', adsRouter);    // 广告回调接口
// app.use('/api/v1/games', gameRouter); // 小游戏接口

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
