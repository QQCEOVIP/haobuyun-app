import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './shared/schema';

// 数据库连接配置
const connectionString = process.env.DATABASE_URL;

// 创建数据库连接
const client = postgres(connectionString || '', {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: {
    rejectUnauthorized: false // Supabase 需要 SSL 连接
  }
});

// 创建 Drizzle ORM 实例
export const db = drizzle(client, { schema });

// 导出 schema 以便在其他地方使用
export * from './shared/schema';
