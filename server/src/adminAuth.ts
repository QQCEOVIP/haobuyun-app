/**
 * Admin Authentication Module
 * 管理员认证模块 - 独立于主APP的认证系统
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

// ============ 配置 ============

// 管理员账号（硬编码）
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '15977355155';

// JWT密钥（环境变量优先，提供默认值）
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'hbyun_admin_jwt_secret_2026_q2_vault';
const JWT_EXPIRES_IN = '24h';

// ============ 密码工具函数 ============

/**
 * 对密码进行bcrypt哈希
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * 比较密码文与哈希值
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============ Token生成 ============

export interface AdminTokenPayload {
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * 生成管理员JWT Token
 */
export function generateAdminToken(username: string): string {
  const payload: AdminTokenPayload = {
    username,
    role: 'admin',
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证JWT Token
 */
export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AdminTokenPayload;
  } catch (error) {
    return null;
  }
}

// ============ 中间件 ============

export interface AdminRequest extends Request {
  admin?: AdminTokenPayload;
}

/**
 * 管理员认证中间件
 * 从Authorization header中提取并验证JWT token
 */
export function adminAuthMiddleware(req: AdminRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.status(401).json({ 
      success: false, 
      error: '未提供认证令牌' 
    });
    return;
  }
  
  // 支持 "Bearer <token>" 格式
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;
  
  const payload = verifyAdminToken(token);
  
  if (!payload) {
    res.status(401).json({ 
      success: false, 
      error: '认证令牌无效或已过期' 
    });
    return;
  }
  
  // 将管理员信息附加到请求对象
  req.admin = payload;
  next();
}

// ============ 路由处理函数 ============

/**
 * 管理员登录处理函数
 * POST /api/v1/admin/login
 * Body: { username: string, password: string }
 */
export async function adminLoginHandler(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;
    
    // 参数验证
    if (!username || !password) {
      res.status(400).json({ 
        success: false, 
        error: '请提供用户名和密码' 
      });
      return;
    }
    
    // 验证用户名
    if (username !== ADMIN_USERNAME) {
      res.status(401).json({ 
        success: false, 
        error: '用户名或密码错误' 
      });
      return;
    }
    
    // 验证密码
    if (password !== ADMIN_PASSWORD) {
      res.status(401).json({ 
        success: false, 
        error: '用户名或密码错误' 
      });
      return;
    }
    
    // 生成token
    const token = generateAdminToken(username);
    
    res.json({
      success: true,
      data: {
        token,
        username,
        role: 'admin',
        expiresIn: JWT_EXPIRES_IN,
      }
    });
    
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
}

/**
 * 获取当前管理员信息
 * GET /api/v1/admin/me
 */
export function adminMeHandler(req: AdminRequest, res: Response): void {
  if (!req.admin) {
    res.status(401).json({ 
      success: false, 
      error: '未认证' 
    });
    return;
  }
  
  res.json({
    success: true,
    data: {
      username: req.admin.username,
      role: req.admin.role,
    }
  });
}

// ============ 导出配置信息（供测试使用） ============

export const ADMIN_CONFIG = {
  USERNAME: ADMIN_USERNAME,
  JWT_SECRET,
  JWT_EXPIRES_IN,
};
