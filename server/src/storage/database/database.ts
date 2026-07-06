import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './shared/schema';

// 数据库连接配置
const connectionString = process.env.DATABASE_URL;

// 创建数据库连接
// 如果没有配置 DATABASE_URL，使用一个不会建立连接的 client
// 这会导致查询失败，但不会阻止服务器启动
const client = connectionString
  ? postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: {
        rejectUnauthorized: false // Supabase 需要 SSL 连接
      }
    })
  : postgres('postgres://localhost:5432/postgres', {
      max: 0, // 不建立任何连接
      idle_timeout: 0,
      connect_timeout: 1,
    });

// 创建 Drizzle ORM 实例
export const db = drizzle(client, { schema });

// 导出 schema 以便在其他地方使用
export * from './shared/schema';
