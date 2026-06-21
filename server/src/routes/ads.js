/**
 * 广告相关路由 - 扩展点预留
 * 
 * TODO: 未来接入广告回调
 * - AdMob (Google)
 * - 穿山甲 (ByteDance)
 * - 优量汇 (Tencent)
 * 
 * 功能规划：
 * 1. 广告观看回调接口 - 接收第三方广告平台回调
 * 2. 广告奖励发放 - 验证回调真实性后发放积分
 * 3. 广告观看记录 - 记录用户广告观看历史
 * 4. 防刷验证 - 设备指纹、IP频次、行为分析
 */

import { Router } from 'express';

const router = Router();

/**
 * POST /api/v1/ads/callback
 * 广告回调接口 - 接收广告平台回调
 * 
 * 预期请求体：
 * {
 *   ad_type: 'rewarded' | 'interstitial' | 'banner',
 *   user_id: string,
 *   device_fingerprint: string,
 *   timestamp: number,
 *   signature: string,
 *   extra_data: object
 * }
 */
router.post('/callback', (req, res) => {
  // TODO: 实现广告回调验证逻辑
  // 1. 验证签名 (防止伪造回调)
  // 2. 验证设备指纹 (防刷)
  // 3. 验证时间戳 (防重放攻击)
  // 4. 调用 ad_anti_fraud 检查
  // 5. 记录到 ad_rewards 表
  // 6. 发放积分奖励
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: '广告回调接口预留点，等待接入广告平台'
  });
});

/**
 * GET /api/v1/ads/config
 * 获取广告配置 - 前端拉取广告展示配置
 * 
 * 响应：
 * {
 *   ad_enabled: boolean,
 *   ad_placements: {
 *     rewarded: { ad_unit_id: string, enabled: boolean },
 *     interstitial: { ad_unit_id: string, enabled: boolean },
 *     banner: { ad_unit_id: string, enabled: boolean }
 *   },
 *   reward_amount: { rewarded: number, interstitial: number }
 * }
 */
router.get('/config', (req, res) => {
  // TODO: 返回广告配置
  // 根据用户会员状态决定是否展示广告
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    data: {
      ad_enabled: false,
      ad_placements: {
        rewarded: { ad_unit_id: '', enabled: false },
        interstitial: { ad_unit_id: '', enabled: false },
        banner: { ad_unit_id: '', enabled: false }
      },
      reward_amount: {
        rewarded: 10,
        interstitial: 5
      }
    }
  });
});

/**
 * GET /api/v1/ads/history
 * 获取广告观看记录
 * 
 * Query: user_id, page, limit
 */
router.get('/history', (req, res) => {
  // TODO: 返回用户广告观看历史
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: '广告记录接口预留点'
  });
});

/**
 * GET /api/v1/ads/balance
 * 获取今日广告收益上限
 * 
 * 每个用户每天广告观看次数限制
 */
router.get('/balance', (req, res) => {
  // TODO: 返回今日剩余可观看次数
  
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    data: {
      daily_limit: 10,
      remaining: 10,
      reset_at: new Date().toISOString()
    }
  });
});

export default router;
