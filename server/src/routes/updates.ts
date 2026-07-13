import { Router, type Request, type Response } from 'express';

const router: ReturnType<typeof Router> = Router();

// 版本信息（硬编码，后续可改为数据库存储）
const LATEST_VERSION = {
  version_code: 10002,
  version_name: '1.0.2',
  download_url: 'https://www.coze.cn/s/4RKsn6XSxGM',
  apk_size: 0,
  min_sdk_version: 21,
  release_notes: '管理助手固定定位、版本号统一、认证时间修复、检测不自动弹出、备份弹窗可滚动',
  mandatory: false,
};

/**
 * 服务端文件：server/src/routes/updates.ts
 * 接口：GET /api/v1/updates/check
 * Query 参数：current_version_code: number (Android versionCode，整数)
 */
router.get('/check', (req, res) => {
  const currentVersionCode = parseInt(req.query.current_version_code as string, 10);

  if (isNaN(currentVersionCode)) {
    return res.status(400).json({ error: 'current_version_code 必须为整数' });
  }

  const updateAvailable = currentVersionCode < LATEST_VERSION.version_code;

  return res.json({
    update_available: updateAvailable,
    latest_version_code: LATEST_VERSION.version_code,
    latest_version_name: LATEST_VERSION.version_name,
    download_url: LATEST_VERSION.download_url,
    release_notes: LATEST_VERSION.release_notes,
    mandatory: LATEST_VERSION.mandatory,
    apk_size: LATEST_VERSION.apk_size,
    min_sdk_version: LATEST_VERSION.min_sdk_version,
  });
});

export default router;
