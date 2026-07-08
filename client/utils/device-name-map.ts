/**
 * 手机型号代码 → 易读品牌型号名 映射表
 * Android 的 Build.MODEL 经常返回内部型号代码（如 23127PN0CC），
 * 需要映射为用户可识别的品牌+型号名。
 */

const MODEL_MAP: Record<string, string> = {
  // ========== 小米 (Xiaomi) ==========
  // 小米14系列
  '23127PN0CC': '小米14',
  '2312DRA50C': '小米14 Pro',
  '24050PN85C': '小米14 Ultra',
  // 小米13系列
  '2211133C': '小米13',
  '2210132C': '小米13 Pro',
  '2304FPN6DC': '小米13 Ultra',
  // 小米12系列
  '2201123C': '小米12',
  '2201122C': '小米12 Pro',
  '22071212AC': '小米12S Ultra',
  // 小米 MIX 系列
  '2203853C': '小米MIX Fold 2',
  '2308BPXD0C': '小米MIX Fold 3',
  '24072PX77C': '小米MIX Fold 4',
  '22061218C': '小米MIX 5',

  // ========== Redmi ==========
  // Redmi K70系列
  '23117RK66C': 'Redmi K70',
  '23116PN5BG': 'Redmi K70 Pro',
  '2405CRPFCC': 'Redmi K70 至尊版',
  // Redmi K60系列
  '22122RK93C': 'Redmi K60',
  '221113CKC': 'Redmi K60 Pro',
  '23078RKD5C': 'Redmi K60 至尊版',
  // Redmi Note 13系列
  '24053PN09C': 'Redmi Note 13',
  '23124RA7EC': 'Redmi Note 13 Pro',
  '2312DRA50G': 'Redmi Note 13 Pro+',
  // Redmi Note 12系列
  '2210132CP': 'Redmi Note 12',
  '22095RA98C': 'Redmi Note 12 Pro',
  '22087RA4DI': 'Redmi Note 12 Turbo',
  // Redmi Turbo 3
  '24069PC21C': 'Redmi Turbo 3',

  // ========== OPPO ==========
  // Find X系列
  'PJH110': 'OPPO Find X7',
  'PJZ110': 'OPPO Find X7 Ultra',
  'PHZ110': 'OPPO Find X6',
  'PHZ120': 'OPPO Find X6 Pro',
  'PGX110': 'OPPO Find X5 Pro',
  // Find N系列（折叠屏）
  'PHW110': 'OPPO Find N3',
  'PFFM20': 'OPPO Find N3 Flip',
  'PGU110': 'OPPO Find N2',
  'PGT110': 'OPPO Find N2 Flip',
  // Reno系列
  'PKA110': 'OPPO Reno12',
  'PKA120': 'OPPO Reno12 Pro',
  'PJF110': 'OPPO Reno11',
  'PJF120': 'OPPO Reno11 Pro',
  'PHJ110': 'OPPO Reno10',
  'PHJ120': 'OPPO Reno10 Pro',
  'PEHT00': 'OPPO Reno9',
  'PEHM00': 'OPPO Reno9 Pro',
  // A系列
  'PFT110': 'OPPO A3 Pro',
  'PFV110': 'OPPO A2 Pro',
  'PFG110': 'OPPO A1 Pro',

  // ========== vivo ==========
  // X系列
  'V2324A': 'vivo X100',
  'V2323A': 'vivo X100 Pro',
  'V2426A': 'vivo X100 Ultra',
  'V2241A': 'vivo X90',
  'V2242A': 'vivo X90 Pro',
  'V2274A': 'vivo X Fold2',
  'V2309A': 'vivo X Fold3',
  'V2366A': 'vivo X Flip',
  // S系列
  'V2308A': 'vivo S18',
  'V2330A': 'vivo S18 Pro',
  'V2425A': 'vivo S19',
  'V2456A': 'vivo S19 Pro',
  // Y系列
  'V2203A': 'vivo Y78',
  'V2325A': 'vivo Y100',
  'V2454A': 'vivo Y200',
  // iQOO
  'V2307A': 'iQOO 12',
  'V2338A': 'iQOO 12 Pro',
  'V2415A': 'iQOO Neo9',
  'V2402A': 'iQOO Z9',

  // ========== 华为 (Huawei) ==========
  // Mate系列
  'ALN-AL10': '华为Mate 60',
  'ALN-AL80': '华为Mate 60 Pro',
  'ALN-AL00': '华为Mate 60 Pro+',
  'ALN-AL90': '华为Mate 60 RS',
  'CET-AL60': '华为Mate 50',
  'CET-AL00': '华为Mate 50 Pro',
  'DCO-AL00': '华为Mate 50 RS',
  'NOH-AN00': '华为Mate 40 Pro',
  'NOP-AN00': '华为Mate 40 Pro+',
  // P系列
  'ADY-AL00': '华为P60',
  'ADY-AL10': '华为P60 Pro',
  'MNA-AL00': '华为P60 Art',
  'JAD-AL00': '华为P50',
  'JAD-AL80': '华为P50 Pro',
  // Mate X系列（折叠屏）
  'ALT-AL10': '华为Mate X5',
  'ALT-AL00': '华为Mate X5',
  'PAL-AL10': '华为Mate X3',
  'TAH-AN00': '华为Mate X2',
  // nova系列
  'FOA-AL00': '华为nova 12',
  'FOA-AL10': '华为nova 12 Pro',
  'FOA-AL20': '华为nova 12 Ultra',
  'ANG-AN00': '华为nova 10',
  'ANG-AN20': '华为nova 10 Pro',

  // ========== 荣耀 (Honor) ==========
  // Magic系列
  'PGP-AN00': '荣耀Magic6',
  'PGP-AN10': '荣耀Magic6 Pro',
  'PGT-AN00': '荣耀Magic5',
  'PGT-AN20': '荣耀Magic5 Pro',
  'LGE-AN00': '荣耀Magic4',
  'LGE-AN20': '荣耀Magic4 Pro',
  // 数字系列
  'BVL-AN00': '荣耀100',
  'BVL-AN20': '荣耀100 Pro',
  'DNP-AN00': '荣耀90',
  'DNP-AN20': '荣耀90 Pro',
  'REP-AN00': '荣耀80',
  // X系列
  'BRP-AN00': '荣耀X50',
  'BRP-AN10': '荣耀X50 GT',
  'DUB-AN00': '荣耀X40',
};

/**
 * 将 Android 型号代码映射为易读的品牌+型号名
 * @param modelCode - Build.MODEL 返回的型号代码（如 "23127PN0CC"）
 * @param brand - 可选的品牌名（如 "Xiaomi", "OPPO"），用于兜底
 * @returns 易读的设备名（如 "小米14"）
 */
export function resolveDeviceName(modelCode: string, brand?: string): string {
  if (!modelCode) return '未知设备';

  // 1. 精确匹配映射表
  const mapped = MODEL_MAP[modelCode];
  if (mapped) return mapped;

  // 2. 尝试大小写不敏感匹配
  const upper = modelCode.toUpperCase();
  for (const [code, name] of Object.entries(MODEL_MAP)) {
    if (code.toUpperCase() === upper) return name;
  }

  // 3. 兜底：品牌名 + 型号代码
  if (brand && brand !== 'unknown') {
    return `${brand}-${modelCode}`;
  }

  return `未知品牌-${modelCode}`;
}
