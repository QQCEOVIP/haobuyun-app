/**
 * 服务号码黑名单
 * 这些号码是官方服务号码，禁止用户投票/标记
 */
const SERVICE_NUMBERS = new Set([
  // 运营商服务
  '10086',  // 中国移动
  '10010',  // 中国联通
  '10000',  // 中国电信
  '10099',  // 中国广电
  // 银行服务
  '95588',  // 工商银行
  '95533',  // 建设银行
  '95566',  // 中国银行
  '95555',  // 招商银行
  '95559',  // 交通银行
  '95558',  // 中信银行
  '95501',  // 广发银行
  '95528',  // 浦发银行
  '95568',  // 民生银行
  '95511',  // 平安银行
  '95561',  // 兴业银行
  '95577',  // 华夏银行
  // 公共服务
  '12306',  // 铁路客服
  '12315',  // 消费者投诉
  '12345',  // 市民服务热线
  '12320',  // 卫生热线
  '12365',  // 质检热线
  '12369',  // 环保热线
  '12328',  // 交通运输
  '12318',  // 文化市场
  '12333',  // 人力资源社会保障
  // 紧急服务
  '110',    // 报警
  '119',    // 火警
  '120',    // 急救
  '122',    // 交通事故
  // 快递服务
  '95543',  // 顺丰速运
  '95338',  // 中通快递
  '95311',  // 韵达快递
  '95353',  // 圆通速递
  '95546',  // 申通快递
  '11183',  // EMS
]);

/**
 * 标准化手机号（去除空格、横杠、括号）
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '');
}

/**
 * 检查是否为服务号码
 * 服务号码不允许用户投票/标记
 */
export function isServiceNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const normalized = normalizePhone(phone);
  return SERVICE_NUMBERS.has(normalized);
}

/**
 * 获取服务号码的提示信息
 */
export function getServiceNumberMessage(phone: string): string {
  const normalized = normalizePhone(phone);
  // 运营商
  if (['10086', '10010', '10000', '10099'].includes(normalized)) {
    return '该号码是运营商服务号码，不允许标记';
  }
  // 银行
  if (normalized.startsWith('955') || normalized.startsWith('953')) {
    return '该号码是银行/金融机构服务号码，不允许标记';
  }
  // 公共服务
  if (normalized.startsWith('123')) {
    return '该号码是公共服务号码，不允许标记';
  }
  // 紧急服务
  if (['110', '119', '120', '122'].includes(normalized)) {
    return '该号码是紧急服务号码，不允许标记';
  }
  return '该号码是官方服务号码，不允许标记';
}
