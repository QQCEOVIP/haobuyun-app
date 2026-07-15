import { Router, type Request, type Response } from 'express';
import { db } from '../storage/database';
import { profiles, userPoints } from '../storage/database/shared/schema';
import { eq, inArray, desc } from 'drizzle-orm';

const router: Router = Router();

// 获取用户中间件
const getUserId = (req: any): string | null => {
  const session = req.headers['x-session'];
  if (session && typeof session === 'string') return session;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
};

// GET /api/v1/users/profile - 获取用户资料
router.get('/profile', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.user_id, userId),
    });

    res.json({
      success: true,
      data: profile || { nickname: null, nickname_updated_at: null },
    });
  } catch (error) {
    console.error('获取用户资料失败:', error);
    res.status(500).json({ error: '获取用户资料失败' });
  }
});

// PUT /api/v1/users/nickname - 设置昵称
router.put('/nickname', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const { nickname } = req.body;
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      return res.status(400).json({ error: '昵称不能为空' });
    }

    if (nickname.length > 20) {
      return res.status(400).json({ error: '昵称不能超过20个字符' });
    }

    // 检查30天间隔
    const existingProfile = await db.query.profiles.findFirst({
      where: eq(profiles.user_id, userId),
    });

    if (existingProfile?.nickname_updated_at) {
      const lastUpdate = new Date(existingProfile.nickname_updated_at);
      const now = new Date();
      const daysSinceUpdate = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceUpdate < 30) {
        const remainingDays = 30 - daysSinceUpdate;
        return res.status(429).json({ 
          error: `昵称修改间隔为30天，还需等待${remainingDays}天`,
          remaining_days: remainingDays,
        });
      }
    }

    const now = new Date();

    if (existingProfile) {
      // 更新现有资料
      await db.update(profiles)
        .set({ 
          nickname: nickname.trim(),
          nickname_updated_at: now,
          updated_at: now,
        })
        .where(eq(profiles.user_id, userId));
    } else {
      // 创建新资料
      await db.insert(profiles).values({
        user_id: userId,
        nickname: nickname.trim(),
        nickname_updated_at: now,
      });
    }

    res.json({
      success: true,
      data: {
        nickname: nickname.trim(),
        nickname_updated_at: now.toISOString(),
        remaining_days: 30,
      },
    });
  } catch (error) {
    console.error('设置昵称失败:', error);
    res.status(500).json({ error: '设置昵称失败' });
  }
});

// GET /api/v1/users/leaderboard - 排行榜
router.get('/leaderboard', async (req, res) => {
  try {
    // 获取积分排行榜前50名
    const leaderboard = await db
      .select({
        user_id: userPoints.user_id,
        balance: userPoints.balance,
      })
      .from(userPoints)
      .orderBy(desc(userPoints.balance))
      .limit(50);

    // 获取所有用户的资料
    const userIds = leaderboard.map((l) => l.user_id);
    const profilesData = userIds.length > 0
      ? await db.select().from(profiles).where(inArray(profiles.user_id, userIds))
      : [];

    const profileMap = new Map(profilesData.map((p) => [p.user_id, p]));

    // 组合结果
    const result = leaderboard.map((item, index) => {
      const profile = profileMap.get(item.user_id);
      let displayName: string;
      
      if (profile?.nickname) {
        displayName = profile.nickname;
      } else {
        // 无昵称显示手机号前3后4
        const userIdStr = String(item.user_id);
        displayName = `${userIdStr.substring(0, 3)}****${userIdStr.substring(userIdStr.length - 4)}`;
      }

      return {
        rank: index + 1,
        user_id: item.user_id,
        display_name: displayName,
        nickname: profile?.nickname || null,
        balance: item.balance,
      };
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('获取排行榜失败:', error);
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

export default router;
