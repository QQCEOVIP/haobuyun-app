import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './shared/schema';

// 数据库连接配置
const connectionString = process.env.DATABASE_URL;

// 创建数据库连接
// 如果没有配置 DATABASE_URL，创建一个不会实际建立连接的 client
// 查询会失败但不会阻止服务器启动
const client = connectionString
  ? postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: {
        rejectUnauthorized: false // Supabase 需要 SSL 连接
      }
    })
  : postgres({
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      username: 'postgres',
      password: 'postgres',
      max: 0,
      idle_timeout: 0,
      connect_timeout: 1,
    });

// 创建 Drizzle ORM 实例（始终非空）
export const db = drizzle(client, { schema });

// 导出是否有有效数据库连接（供中间件检查）
export const hasDatabase = !!connectionString;

// 导出 schema 以便在其他地方使用
export * from './shared/schema';
