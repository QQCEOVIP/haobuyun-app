import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './shared/schema';

// 数据库连接配置
const connectionString = process.env.DATABASE_URL;

// 如果没有配置 DATABASE_URL，db 为 null
// 路由需要检查 db 是否为 null
const client = connectionString
  ? postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: {
        rejectUnauthorized: false // Supabase 需要 SSL 连接
      }
    })
  : null;

// 创建 Drizzle ORM 实例（可能为 null）
export const db = client ? drizzle(client, { schema }) : null;

// 导出 schema 以便在其他地方使用
export * from './shared/schema';
