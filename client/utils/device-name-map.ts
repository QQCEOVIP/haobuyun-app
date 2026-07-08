/**
 * 设备品牌识别工具
 * 通过 expo-device 的 Device.manufacturer 获取品牌，
 * 将英文品牌名映射为中文显示名。
 */

const BRAND_MAP: Record<string, string> = {
  // 小米系
  'xiaomi': '小米',
  'redmi': '小米',
  'poco': '小米',
  // 华为系
  'huawei': '华为',
  'honor': '荣耀',
  // OPPO 系
  'oppo': 'OPPO',
  'oneplus': '一加',
  'realme': 'realme',
  // vivo 系
  'vivo': 'vivo',
  'iqoo': 'iQOO',
  // 其他国产
  'meizu': '魅族',
  'lenovo': '联想',
  'motorola': '摩托罗拉',
  'nubia': '努比亚',
  'zte': '中兴',
  'asus': '华硕',
  // 国际品牌
  'samsung': '三星',
  'apple': '苹果',
  'google': 'Google',
  'sony': '索尼',
  'lg': 'LG',
  'nokia': '诺基亚',
};

/**
 * 将设备制造商名称转为中文品牌名
 * @param manufacturer - Device.manufacturer 返回值（如 "Xiaomi", "HUAWEI"）
 * @returns 中文品牌名，如 "小米"；未匹配时返回原始值
 */
export function resolveBrand(manufacturer: string | null | undefined): string {
  if (!manufacturer) return '';
  const key = manufacturer.toLowerCase().trim();
  return BRAND_MAP[key] || manufacturer;
}

/**
 * 生成设备显示名称
 * @param manufacturer - Device.manufacturer 返回值
 * @returns 如 "小米手机"、"苹果手机"；获取不到品牌时返回 "未知设备"
 */
export function getDeviceDisplayName(manufacturer: string | null | undefined): string {
  const brand = resolveBrand(manufacturer);
  if (!brand) return '未知设备';
  // OPPO/vivo/realme 等品牌名本身已足够，不需要加"手机"
  const noSuffixBrands = ['OPPO', 'vivo', 'realme', 'iQOO', 'Google', 'LG'];
  if (noSuffixBrands.includes(brand)) return brand;
  return `${brand}手机`;
}
