/**
 * 游戏相关路由 - 扩展点预留
 * 
 * TODO: 未来接入小游戏
 * 1. 内置 H5 小游戏 - 跳一跳、消消乐等
 * 2. 外部小游戏渠道 - 抖音/快手小程序
 * 3. 推广任务游戏 - 邀请好友玩游戏获奖励
 * 
 * 功能规划：
 * 1. 游戏列表 - 获取可玩游戏
 * 2. 游戏开始 - 创建游戏会话
 * 3. 游戏结束 - 提交分数、发放奖励
 * 4. 游戏会话管理 - 查询历史游戏记录
 * 5. 排行榜 - 游戏分数排行榜
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /api/v1/games
 * 获取游戏列表
 * 
 * 响应：
 * {
 *   games: [
 *     {
 *       id: string,
 *       name: string,
 *       type: 'h5' | 'external' | 'task',
 *       thumbnail: string,
 *       url: string,
 *       reward_points: number,
 *       min_score: number,
 *       description: string
 *     }
 *   ]
 * }
 */
router.get('/', (req, res) => {
  // TODO: 返回可玩游戏列表
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    data: {
      games: [
        // 预留游戏位
        { id: 'game_001', name: '跳一跳', type: 'h5', reward_points: 20 },
        { id: 'game_002', name: '消消乐', type: 'h5', reward_points: 30 },
        { id: 'game_003', name: '邀请好友', type: 'task', reward_points: 50 }
      ]
    }
  });
});

/**
 * POST /api/v1/games/start
 * 开始游戏 - 创建游戏会话
 * 
 * 请求体：
 * {
 *   game_id: string
 * }
 * 
 * 响应：
 * {
 *   session_id: string,
 *   game_url: string,
 *   expires_at: string
 * }
 */
router.post('/start', (req, res) => {
  // TODO: 
  // 1. 验证用户积分/会员状态
  // 2. 创建 game_sessions 记录
  // 3. 生成游戏会话 token
  // 4. 返回游戏 URL
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: '游戏开始接口预留点'
  });
});

/**
 * POST /api/v1/games/submit
 * 提交游戏结果
 * 
 * 请求体：
 * {
 *   session_id: string,
 *   score: number,
 *   duration: number,
 *   completion: 'completed' | 'abandoned'
 * }
 * 
 * 响应：
 * {
 *   success: boolean,
 *   reward_points: number,
 *   new_balance: number
 * }
 */
router.post('/submit', (req, res) => {
  // TODO:
  // 1. 验证 session_id 有效性
  // 2. 验证分数合理性 (防止作弊)
  // 3. 计算奖励 (根据分数达标情况)
  // 4. 发放积分
  // 5. 更新 game_sessions 状态
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: '游戏结果提交接口预留点'
  });
});

/**
 * GET /api/v1/games/sessions
 * 获取游戏会话记录
 * 
 * Query: user_id, page, limit, game_id (optional)
 */
router.get('/sessions', (req, res) => {
  // TODO: 返回用户游戏历史
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: '游戏记录接口预留点'
  });
});

/**
 * GET /api/v1/games/leaderboard/:game_id
 * 获取游戏排行榜
 * 
 * Query: period ('daily' | 'weekly' | 'all')
 */
router.get('/leaderboard/:game_id', (req, res) => {
  // TODO: 返回游戏排行榜
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: '游戏排行榜接口预留点'
  });
});

/**
 * GET /api/v1/games/tasks
 * 获取推广任务列表
 * 
 * 任务类型：
 * - 邀请好友注册
 * - 分享游戏到社交平台
 * - 连续游戏天数
 */
router.get('/tasks', (req, res) => {
  // TODO: 返回可完成的推广任务
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    data: {
      tasks: [
        { id: 'invite_1', type: 'invite', reward: 50, progress: 0, target: 1 },
        { id: 'share_1', type: 'share', reward: 20, progress: 0, target: 1 },
        { id: 'streak_7', type: 'streak', reward: 100, progress: 0, target: 7 }
      ]
    }
  });
});

/**
 * POST /api/v1/games/tasks/claim
 * 领取任务奖励
 * 
 * 请求体：
 * {
 *   task_id: string
 * }
 */
router.post('/tasks/claim', (req, res) => {
  // TODO: 验证任务完成情况，发放奖励
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: '任务奖励领取接口预留点'
  });
});

export default router;
