/**
 * Environment integrity verification client
 * hbyun-watermark-v1: 验证运行环境是否与预设的包名和域名匹配
 */

const HBYUN_EXPECTED_PACKAGE = 'com.haobuyun.app';
const HBYUN_EXPECTED_ORIGIN = 'haobuyun.app';
const HBYUN_SIGNATURE_SALT = 'hbyun_sig_2026_q2_vault';

function generateClientSignature(packageName: string, origin: string): string {
  const combined = `${packageName}:${origin}:${HBYUN_SIGNATURE_SALT}`;
  let hash = 0x7e3a9b1c;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
  }
  return `hbyun_${Math.abs(hash).toString(36)}_${packageName.split('.').pop()}`;
}

/**
 * 验证当前运行环境是否与预期匹配
 * 在 APP 启动时调用，静默记录不匹配的情况
 */
export async function verifyEnvironment(): Promise<boolean> {
  try {
    // 获取当前环境信息
    const origin = typeof window !== 'undefined' ? window.location?.origin || '' : '';
    const packageName = HBYUN_EXPECTED_PACKAGE; // Expo 固定包名
    
    const clientSignature = generateClientSignature(packageName, origin);
    
    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'https://kdsf38dsn9.coze.site';
    const response = await fetch(`${baseUrl}/api/v1/verify-env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageName,
        origin,
        appSignature: clientSignature,
      }),
    });
    
    if (!response.ok) return false;
    
    const result = await response.json();
    
    if (!result.verified) {
      // 静默记录，不影响用户体验
      console.warn('[hbyun-env] Environment verification failed');
    }
    
    return result.verified;
  } catch {
    // 网络错误时静默失败
    return false;
  }
}

/**
 * 获取客户端签名（用于调试）
 */
export function getClientSignature(): string {
  const origin = typeof window !== 'undefined' ? window.location?.origin || '' : '';
  return generateClientSignature(HBYUN_EXPECTED_PACKAGE, origin);
}
