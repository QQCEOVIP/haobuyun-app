import { db } from '../storage/database';
import { sql } from 'drizzle-orm';

/**
 * 清理超过30天的投票记录
 * 可在应用启动时调用一次，也可通过 API 手动触发
 */
export async function cleanupExpiredVotes(): Promise<number> {
  try {
    const result = await db.execute(sql`
      DELETE FROM number_votes
      WHERE updated_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `);
    const deletedCount = (result as any[])?.length || 0;
    if (deletedCount > 0) {
      console.log(`[Cleanup] Deleted ${deletedCount} expired votes (older than 30 days)`);
    }
    return deletedCount;
  } catch (error) {
    console.error('[Cleanup] Error cleaning up expired votes:', error);
    return 0;
  }
}

/**
 * 启动定时清理任务：每6小时执行一次
 */
export function startScheduledCleanup() {
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  // 启动时立即执行一次
  cleanupExpiredVotes();

  // 定时执行
  setInterval(() => {
    cleanupExpiredVotes();
  }, INTERVAL_MS);

  console.log('[Cleanup] Scheduled cleanup started (every 6 hours)');
}
