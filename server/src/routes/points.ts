import { Router } from "express";
import { db } from "../database";
import { userPoints, pointRecords, shopProducts, exchangeRecords, medals, userMedals, reportValidations, checkinStreaks, dailyReports, flaggedAccounts, invalidReports } from "../database/shared/schema";
import { eq, desc, and, sql, gte, lt } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const router = Router();

// 获取 Supabase Admin Client
const getSupabaseAdmin = () => createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// 获取当前用户ID
const getUserId = async (req: any): Promise<string | null> => {
  const sessionToken = req.headers["x-session"];
  if (!sessionToken) return null;
  
  try {
    const supabase = getSupabaseAdmin();
    const { data: { user }, error } = await supabase.auth.getUser(sessionToken);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
};

// 计算手机号哈希（脱敏）
const hashPhone = (phone: string): string => {
  return crypto.createHash("sha256").update(phone).digest("hex").substring(0, 64);
};

// 获取用户积分信息
router.get("/balance", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    let points = await db.query.userPoints.findFirst({
      where: eq(userPoints.user_id, userId)
    });

    // 如果没有记录，创建初始记录
    if (!points) {
      const newPoints = {
        user_id: userId,
        balance: 0,
        total_earned: 0,
        total_spent: 0,
        credit_score: 100
      };
      await db.insert(userPoints).values(newPoints);
      points = { ...newPoints, id: "", created_at: new Date(), updated_at: new Date() };
    }

    res.json({
      balance: points.balance,
      total_earned: points.total_earned,
      total_spent: points.total_spent,
      credit_score: points.credit_score
    });
  } catch (error) {
    console.error("获取积分失败:", error);
    res.status(500).json({ error: "获取积分失败" });
  }
});

// 获取积分记录
router.get("/records", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const type = req.query.type as string;

    let query = db.query.pointRecords.findMany({
      where: eq(pointRecords.user_id, userId),
      orderBy: [desc(pointRecords.created_at)],
      limit,
      offset
    });

    if (type === "earn" || type === "spend") {
      query = db.query.pointRecords.findMany({
        where: and(
          eq(pointRecords.user_id, userId),
          eq(pointRecords.type, type)
        ),
        orderBy: [desc(pointRecords.created_at)],
        limit,
        offset
      });
    }

    const records = await query;

    res.json({
      records: records.map(r => ({
        id: r.id,
        type: r.type,
        action: r.action,
        points: r.points,
        balance_after: r.balance_after,
        description: r.description,
        created_at: r.created_at
      })),
      has_more: records.length === limit
    });
  } catch (error) {
    console.error("获取积分记录失败:", error);
    res.status(500).json({ error: "获取积分记录失败" });
  }
});

// 标注号码并获取积分
router.post("/report", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const { phone, report_type = "invalid" } = req.body;
    if (!phone) {
      return res.status(400).json({ error: "手机号不能为空" });
    }

    const phoneHash = hashPhone(phone);

    // 检查是否为异常账号
    const flagged = await db.query.flaggedAccounts.findFirst({
      where: and(
        eq(flaggedAccounts.user_id, userId),
        eq(flaggedAccounts.status, "pending")
      )
    });

    if (flagged) {
      return res.json({
        success: false,
        reason: "你的账号正在审核中，标注暂不计入奖励",
        points_earned: 0
      });
    }

    // 检查每日上限
    const today = new Date().toISOString().split("T")[0];
    let dailyStat = await db.query.dailyReports.findFirst({
      where: and(
        eq(dailyReports.user_id, userId),
        eq(dailyReports.report_date, today)
      )
    });

    if (dailyStat && dailyStat.valid_count >= 50) {
      return res.json({
        success: false,
        reason: "今日标注已达上限（50个）",
        points_earned: 0
      });
    }

    // 检查该号码是否已被此用户标注过
    const existingReport = await db.query.reportValidations.findFirst({
      where: and(
        eq(reportValidations.phone_hash, phoneHash),
        eq(reportValidations.reporter_id, userId)
      )
    });

    if (existingReport) {
      return res.json({
        success: false,
        reason: "你已经标注过此号码",
        points_earned: 0
      });
    }

    // 记录标注
    await db.insert(reportValidations).values({
      phone_hash: phoneHash,
      reporter_id: userId
    });

    // 更新每日统计
    if (dailyStat) {
      await db.update(dailyReports)
        .set({ valid_count: dailyStat.valid_count + 1 })
        .where(eq(dailyReports.id, dailyStat.id));
    } else {
      await db.insert(dailyReports).values({
        user_id: userId,
        report_date: today,
        valid_count: 1
      });
    }

    // 更新众包表
    const existingInvalidReport = await db.query.invalidReports.findFirst({
      where: eq(invalidReports.phone_hash, phoneHash)
    });

    if (existingInvalidReport) {
      await db.update(invalidReports)
        .set({ 
          report_count: existingInvalidReport.report_count + 1,
          last_reporter_id: userId
        })
        .where(eq(invalidReports.id, existingInvalidReport.id));
    } else {
      await db.insert(invalidReports).values({
        phone_hash: phoneHash,
        report_count: 1,
        report_type
      });
    }

    // 判断是否有效标注并发放积分
    let pointsEarned = 0;
    let description = "";

    // 检查是否为首次标注（该号码从未被标注过）
    const totalReports = await db.query.invalidReports.findFirst({
      where: eq(invalidReports.phone_hash, phoneHash)
    });

    if (totalReports && totalReports.report_count === 1) {
      // 首次发现该号码
      pointsEarned = 10;
      description = `首次发现失效号码 +10`;
    } else if (totalReports && totalReports.report_count >= 2) {
      // 协同确认
      pointsEarned = 5;
      description = `协同确认号码 +5`;
    }

    if (pointsEarned > 0) {
      // 更新用户积分
      let userPointRecord = await db.query.userPoints.findFirst({
        where: eq(userPoints.user_id, userId)
      });

      if (!userPointRecord) {
        await db.insert(userPoints).values({
          user_id: userId,
          balance: 0,
          total_earned: 0,
          total_spent: 0,
          credit_score: 100
        });
        userPointRecord = await db.query.userPoints.findFirst({
          where: eq(userPoints.user_id, userId)
        });
      }

      const newBalance = (userPointRecord?.balance || 0) + pointsEarned;

      await db.update(userPoints)
        .set({
          balance: newBalance,
          total_earned: (userPointRecord?.total_earned || 0) + pointsEarned,
          updated_at: new Date()
        })
        .where(eq(userPoints.user_id, userId));

      // 记录积分变动
      await db.insert(pointRecords).values({
        user_id: userId,
        type: "earn",
        action: "report_phone",
        points: pointsEarned,
        balance_after: newBalance,
        description,
        related_id: phoneHash
      });

      // 检查连续7天标注奖励
      await checkStreakReward(userId);

      // 检查勋章
      await checkMedals(userId);
    }

    res.json({
      success: true,
      points_earned: pointsEarned,
      description: pointsEarned > 0 ? description : "标注已记录，待其他用户确认后发放奖励",
      is_valid: pointsEarned > 0,
      total_confirmations: totalReports?.report_count || 1
    });
  } catch (error) {
    console.error("标注号码失败:", error);
    res.status(500).json({ error: "标注失败" });
  }
});

// 检查连续标注奖励
async function checkStreakReward(userId: string) {
  const today = new Date().toISOString().split("T")[0];
  
  let streak = await db.query.checkinStreaks.findFirst({
    where: eq(checkinStreaks.user_id, userId)
  });

  if (!streak) {
    await db.insert(checkinStreaks).values({
      user_id: userId,
      current_streak: 1,
      longest_streak: 0,
      last_checkin_date: today
    });
    return;
  }

  const lastDate = streak.last_checkin_date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = 1;
  if (lastDate === yesterdayStr) {
    newStreak = streak.current_streak + 1;
  }

  const bonusPoints = newStreak === 7 ? 20 : 0;

  await db.update(checkinStreaks)
    .set({
      current_streak: newStreak,
      longest_streak: Math.max(streak.longest_streak, newStreak),
      last_checkin_date: today,
      updated_at: new Date()
    })
    .where(eq(checkinStreaks.id, streak.id));

  if (bonusPoints > 0) {
    let userPointRecord = await db.query.userPoints.findFirst({
      where: eq(userPoints.user_id, userId)
    });

    if (userPointRecord) {
      const newBalance = userPointRecord.balance + bonusPoints;
      await db.update(userPoints)
        .set({
          balance: newBalance,
          total_earned: userPointRecord.total_earned + bonusPoints,
          updated_at: new Date()
        })
        .where(eq(userPoints.user_id, userId));

      await db.insert(pointRecords).values({
        user_id: userId,
        type: "earn",
        action: "streak_bonus",
        points: bonusPoints,
        balance_after: newBalance,
        description: `连续7天标注奖励 +${bonusPoints}`
      });
    }
  }
}

// 检查勋章
async function checkMedals(userId: string) {
  // 获取用户统计
  const totalValidReports = await db.query.reportValidations.findMany({
    where: eq(reportValidations.reporter_id, userId)
  });

  const allMedals = await db.query.medals.findMany({
    where: eq(medals.is_active, true)
  });

  const userEarnedMedals = await db.query.userMedals.findMany({
    where: eq(userMedals.user_id, userId)
  });

  const earnedMedalIds = new Set(userEarnedMedals.map(m => m.medal_id));

  for (const medal of allMedals) {
    if (earnedMedalIds.has(medal.id)) continue;

    let earned = false;

    switch (medal.requirement_type) {
      case "valid_reports":
        earned = totalValidReports.length >= medal.requirement_value;
        break;
      case "streak_days":
        const streak = await db.query.checkinStreaks.findFirst({
          where: eq(checkinStreaks.user_id, userId)
        });
        earned = (streak?.longest_streak || 0) >= medal.requirement_value;
        break;
    }

    if (earned) {
      await db.insert(userMedals).values({
        user_id: userId,
        medal_id: medal.id
      });
    }
  }
}

// 获取商品列表
router.get("/shop/products", async (req, res) => {
  try {
    const category = req.query.category as string;

    let query = db.query.shopProducts.findMany({
      where: eq(shopProducts.is_active, true),
      orderBy: [shopProducts.sort_order, shopProducts.price]
    });

    if (category) {
      query = db.query.shopProducts.findMany({
        where: and(
          eq(shopProducts.is_active, true),
          eq(shopProducts.category, category)
        ),
        orderBy: [shopProducts.sort_order, shopProducts.price]
      });
    }

    const products = await query;

    res.json({
      products: products.map(p => ({
        id: p.id,
        category: p.category,
        name: p.name,
        description: p.description,
        price: p.price,
        stock: p.stock,
        is_unlimited: p.is_unlimited,
        metadata: p.metadata
      }))
    });
  } catch (error) {
    console.error("获取商品列表失败:", error);
    res.status(500).json({ error: "获取商品列表失败" });
  }
});

// 兑换商品
router.post("/shop/exchange", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const { product_id } = req.body;
    if (!product_id) {
      return res.status(400).json({ error: "商品ID不能为空" });
    }

    // 获取商品
    const product = await db.query.shopProducts.findFirst({
      where: and(
        eq(shopProducts.id, product_id),
        eq(shopProducts.is_active, true)
      )
    });

    if (!product) {
      return res.status(404).json({ error: "商品不存在或已下架" });
    }

    // 检查库存
    if (!product.is_unlimited && (product.stock === null || product.stock <= 0)) {
      return res.status(400).json({ error: "商品已售罄" });
    }

    // 获取用户积分
    let userPointRecord = await db.query.userPoints.findFirst({
      where: eq(userPoints.user_id, userId)
    });

    if (!userPointRecord || userPointRecord.balance < product.price) {
      return res.status(400).json({ error: "积分不足" });
    }

    // 扣除积分
    const newBalance = userPointRecord.balance - product.price;
    await db.update(userPoints)
      .set({
        balance: newBalance,
        total_spent: userPointRecord.total_spent + product.price,
        updated_at: new Date()
      })
      .where(eq(userPoints.user_id, userId));

    // 记录积分消费
    await db.insert(pointRecords).values({
      user_id: userId,
      type: "spend",
      action: "exchange_product",
      points: -product.price,
      balance_after: newBalance,
      description: `兑换：${product.name}`,
      related_id: product_id
    });

    // 创建兑换记录
    const exchangeRecord = await db.insert(exchangeRecords).values({
      user_id: userId,
      product_id: product.id,
      points_spent: product.price,
      status: "completed",
      metadata: product.metadata,
      completed_at: new Date()
    });

    // 更新库存
    if (!product.is_unlimited && product.stock !== null) {
      await db.update(shopProducts)
        .set({ stock: product.stock - 1 })
        .where(eq(shopProducts.id, product.id));
    }

    // 处理会员等需要特殊发放的物品
    if (product.category === "membership") {
      // TODO: 发放会员权益
      // 这里简化处理，实际应该记录用户的会员状态和到期时间
    }

    res.json({
      success: true,
      message: "兑换成功",
      remaining_points: newBalance,
      exchange_id: exchangeRecord.id
    });
  } catch (error) {
    console.error("兑换失败:", error);
    res.status(500).json({ error: "兑换失败" });
  }
});

// 获取兑换记录
router.get("/shop/exchanges", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const exchanges = await db.query.exchangeRecords.findMany({
      where: eq(exchangeRecords.user_id, userId),
      orderBy: [desc(exchangeRecords.created_at)]
    });

    // 获取商品信息
    const products = await db.query.shopProducts.findMany();
    const productMap = new Map(products.map(p => [p.id, p]));

    res.json({
      exchanges: exchanges.map(e => ({
        id: e.id,
        product_name: productMap.get(e.product_id)?.name || "未知商品",
        points_spent: e.points_spent,
        status: e.status,
        created_at: e.created_at,
        completed_at: e.completed_at
      }))
    });
  } catch (error) {
    console.error("获取兑换记录失败:", error);
    res.status(500).json({ error: "获取兑换记录失败" });
  }
});

// 获取排行榜
router.get("/leaderboard", async (req, res) => {
  try {
    const period = (req.query.period as string) || "weekly";
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    // 获取用户排名
    const userId = await getUserId(req);

    // 获取所有用户的积分并排序
    const allUsers = await db.query.userPoints.findMany({
      orderBy: [desc(userPoints.total_earned)]
    });

    // 获取用户信息
    const supabase = getSupabaseAdmin();
    const { data: profiles } = await supabase.auth.admin.listUsers();

    const profileMap = new Map(profiles?.users.map(u => [u.id, u]));    

    const leaderboard = allUsers.slice(0, limit).map((u, index) => ({
      rank: index + 1,
      user_id: u.user_id,
      nickname: profileMap.get(u.user_id)?.user_metadata?.nickname || "热心用户",
      avatar_url: profileMap.get(u.user_id)?.user_metadata?.avatar_url || null,
      total_earned: u.total_earned,
      is_me: userId === u.user_id
    }));

    // 查找当前用户排名
    let myRank = null;
    if (userId) {
      const myIndex = allUsers.findIndex(u => u.user_id === userId);
      if (myIndex >= 0) {
        myRank = {
          rank: myIndex + 1,
          total_earned: allUsers[myIndex].total_earned
        };
      }
    }

    res.json({
      period,
      leaderboard,
      my_rank: myRank
    });
  } catch (error) {
    console.error("获取排行榜失败:", error);
    res.status(500).json({ error: "获取排行榜失败" });
  }
});

// 获取勋章列表
router.get("/medals", async (req, res) => {
  try {
    const allMedals = await db.query.medals.findMany({
      where: eq(medals.is_active, true),
      orderBy: [medals.requirement_value]
    });

    // 获取用户已获得的勋章
    const userId = await getUserId(req);
    let earnedMedalIds: string[] = [];

    if (userId) {
      const userMedalRecords = await db.query.userMedals.findMany({
        where: eq(userMedals.user_id, userId)
      });
      earnedMedalIds = userMedalRecords.map(m => m.medal_id);
    }

    res.json({
      medals: allMedals.map(m => ({
        id: m.id,
        code: m.code,
        name: m.name,
        description: m.description,
        icon: m.icon,
        earned: earnedMedalIds.includes(m.id)
      }))
    });
  } catch (error) {
    console.error("获取勋章列表失败:", error);
    res.status(500).json({ error: "获取勋章列表失败" });
  }
});

// 获取用户勋章墙
router.get("/medals/mine", async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "未登录" });
    }

    const userMedalRecords = await db.query.userMedals.findMany({
      where: eq(userMedals.user_id, userId)
    });

    const medalIds = userMedalRecords.map(m => m.medal_id);

    if (medalIds.length === 0) {
      return res.json({ medals: [] });
    }

    const allMedals = await db.query.medals.findMany();
    const medalMap = new Map(allMedals.map(m => [m.id, m]));

    res.json({
      medals: userMedalRecords.map(um => {
        const medal = medalMap.get(um.medal_id);
        return medal ? {
          id: medal.id,
          code: medal.code,
          name: medal.name,
          description: medal.description,
          icon: medal.icon,
          earned_at: um.earned_at
        } : null;
      }).filter(Boolean)
    });
  } catch (error) {
    console.error("获取用户勋章失败:", error);
    res.status(500).json({ error: "获取勋章失败" });
  }
});

export default router;
