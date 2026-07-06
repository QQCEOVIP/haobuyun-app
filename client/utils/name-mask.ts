/**
 * 姓名加密函数
 * 用于对认证用户的姓名进行脱敏处理
 * 
 * 规则：
 * - 张明 → 张*明
 * - 李 → 李*
 * - 欧阳修 → 欧*修
 */
export function encryptName(name: string): string {
  if (!name || name.length === 0) return '';
  if (name.length === 1) return name + '*';
  if (name.length === 2) return name[0] + '*' + name[1];
  // 长度>=3：首字 + * + 尾字
  return name[0] + '*' + name[name.length - 1];
}
