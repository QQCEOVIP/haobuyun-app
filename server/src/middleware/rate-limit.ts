import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// 内存存储：key = userId/IP + route, value = { count, resetAt }
const store = new Map<string, RateLimitEntry>();

// 定期清理过期条目（每 5 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

function getClientKey(req: Request): string {
  const userId = (req.headers['x-user-id'] as string) || (req.headers['x-session'] as string);
  if (userId) return userId;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return ip;
}

/**
 * 创建限流中间件
 * @param maxRequests 窗口期内最大请求数
 * @param windowMs 时间窗口（毫秒）
 */
export function createRateLimiter(maxRequests: number, windowMs: number = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${getClientKey(req)}:${req.path}:${req.method}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: '操作过于频繁，请稍后再试',
        retry_after: retryAfter,
      });
    }

    next();
  };
}

/**
 * 投票防刷中间件：单用户 1 分钟内最多 10 票
 * 需要数据库查询，作为路由级中间件使用
 */
export async function voteRateCheck(req: Request, res: Response, next: NextFunction) {
  const userId = (req.headers['x-user-id'] as string) || (req.headers['x-session'] as string);
  if (!userId) return next(); // 未认证用户由 requireAuth 处理

  try {
    const { db } = await import('../storage/database');
    const { sql } = await import('drizzle-orm');
    const result = await db.execute(sql`
      SELECT COUNT(*)::int as recent_count
      FROM number_votes
      WHERE user_id = ${userId}
        AND created_at > NOW() - INTERVAL '1 minute'
    `);
    const count = (result as any[])?.[0]?.recent_count || 0;
    if (count >= 10) {
      return res.status(429).json({
        error: '投票过于频繁，每分钟最多 10 次',
        retry_after: 60,
      });
    }
    next();
  } catch (err: any) {
    if (err?.code === '42P01') return next(); // 表不存在，跳过检查
    console.error('Vote rate check error:', err);
    next(); // 出错时不阻断请求
  }
}

/**
 * 手机号格式校验
 * 只允许数字和+号开头，长度 3-20 位（支持110、119等3位紧急号码）
 * @version 1.2.0 - 支持3位短号码
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  // DEBUG: 部署验证标记 v1.2.0
  console.log('[DEBUG] isValidPhone called with:', phone, '- version 1.2.0');
  return /^\+?\d{3,20}$/.test(phone.replace(/[\s\-()]/g, ''));
}

/**
 * 标准化手机号（去除空格、横杠、括号）
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '');
}

/**
 * 服务号码黑名单
 * 这些号码是官方服务号码，禁止用户投票/标记
 */
const SERVICE_NUMBERS = new Set([
  // 运营商服务
  '10086',  // 中国移动
  '10010',  // 中国联通
  '10000',  // 中国电信
  '10099',  // 中国广电
  // 银行服务
  '95588',  // 工商银行
  '95533',  // 建设银行
  '95566',  // 中国银行
  '95555',  // 招商银行
  '95559',  // 交通银行
  '95558',  // 中信银行
  '95501',  // 广发银行
  '95528',  // 浦发银行
  '95568',  // 民生银行
  '95511',  // 平安银行
  '95561',  // 兴业银行
  '95577',  // 华夏银行
  // 公共服务
  '12306',  // 铁路客服
  '12315',  // 消费者投诉
  '12345',  // 市民服务热线
  '12320',  // 卫生热线
  '12365',  // 质检热线
  '12369',  // 环保热线
  '12328',  // 交通运输
  '12318',  // 文化市场
  '12333',  // 人力资源社会保障
  // 紧急服务
  '110',    // 报警
  '119',    // 火警
  '120',    // 急救
  '122',    // 交通事故
  // 快递服务
  '95543',  // 顺丰速运
  '95338',  // 中通快递
  '95311',  // 韵达快递
  '95353',  // 圆通速递
  '95546',  // 申通快递
  '11183',  // EMS
]);

/**
 * 检查是否为服务号码
 * 服务号码不允许用户投票/标记
 */
export function isServiceNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const normalized = normalizePhone(phone);
  return SERVICE_NUMBERS.has(normalized);
}
