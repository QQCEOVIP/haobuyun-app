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
        AND voted_at > NOW() - INTERVAL '1 minute'
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
 * 只允许数字和+号开头，长度 7-20 位
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  return /^\+?\d{7,20}$/.test(phone.replace(/[\s\-()]/g, ''));
}

/**
 * 标准化手机号（去除空格、横杠、括号）
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '');
}
