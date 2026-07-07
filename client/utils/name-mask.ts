/**
 * 姓名脱敏工具
 * 用于在认证场景中隐藏用户真实姓名
 */

/**
 * 姓名加密/脱敏
 * - '张明' → '张*明'
 * - '李' → '李*'
 * - '欧阳修' → '欧*修'
 * - 'AB' → 'A*'
 * - 'A' → 'A*'
 */
export function maskName(name: string): string {
  if (!name || name.length === 0) return '';
  if (name.length === 1) return name + '*';
  // 取首尾字符，中间用 * 替代
  const first = name[0];
  const last = name[name.length - 1];
  return first + '*' + last;
}
