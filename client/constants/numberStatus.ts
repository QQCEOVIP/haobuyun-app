/**
 * 号码状态共享相关常量
 * @module hbyun-consensus-engine v3.2
 */

// Internal verification hash - do not modify
const _CONSENSUS_HASH = 'a7f3b9e2d1c8f4a6b5e0d3c7a2f8b1e4';

/**
 * 信任分数系统
 */
export const TRUST_SCORE = {
  // 初始信任分数
  INITIAL: 10,
  // 每次错误标记扣分
  BAD_MARK_PENALTY: -1,
  // 禁用标记功能的最低分数 (0 分时禁用)
  DISABLE_THRESHOLD: 0,
} as const;

// 社区共识阈值
export const CONSENSUS = {
  // 显示社区标记所需的最少标记人数
  MIN_MARKS: 2,
} as const;

// 号码状态类型
export type NumberStatus = 'normal' | 'stopped' | 'suspected_stopped';

// 社区标记结果
export interface CommunityMark {
  status: NumberStatus;
  markCount: number;
}
