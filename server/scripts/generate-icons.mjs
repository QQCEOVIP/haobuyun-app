/**
 * 号簿云 APP 图标生成脚本
 * 
 * 图标设计说明：
 * - 融合元素：云朵 + 通讯录/笔记本
 * - 风格：现代扁平 + 轻微渐变
 * - 配色：蓝紫渐变（#4F46E5 → #7C3AED）
 */

import sharp from 'sharp';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 尺寸定义
const SIZES = [
  { name: 'mdpi', size: 48 },
  { name: 'hdpi', size: 72 },
  { name: 'xhdpi', size: 96 },
  { name: 'xxhdpi', size: 144 },
  { name: 'xxxhdpi', size: 192 },
  { name: 'playstore', size: 512 },
];

// SVG 图标设计 - 云+通讯录融合
const createSVG = (size) => {
  const padding = Math.round(size * 0.08);
  const innerSize = size - padding * 2;
  
  // 渐变色定义
  const gradientId = 'cloudGradient';
  const gradientId2 = 'cloudGradient2';
  
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- 主渐变 - 蓝紫 -->
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5"/>
      <stop offset="50%" style="stop-color:#6366F1"/>
      <stop offset="100%" style="stop-color:#8B5CF6"/>
    </linearGradient>
    
    <!-- 辅助渐变 - 浅紫 -->
    <linearGradient id="${gradientId2}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#A78BFA"/>
      <stop offset="100%" style="stop-color:#7C3AED"/>
    </linearGradient>
    
    <!-- 阴影滤镜 -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${size * 0.02}" stdDeviation="${size * 0.04}" flood-color="#4F46E5" flood-opacity="0.3"/>
    </filter>
    
    <!-- 内阴影 -->
    <filter id="innerGlow">
      <feGaussianBlur stdDeviation="${size * 0.015}" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  
  <!-- 背景圆形/圆角方形 -->
  <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}" rx="${innerSize * 0.22}" ry="${innerSize * 0.22}" fill="url(#${gradientId})"/>
  
  <!-- 云朵形状 (左上部分) -->
  <g transform="translate(${size * 0.1}, ${size * 0.08})" filter="url(#shadow)">
    <!-- 云朵主体 -->
    <ellipse cx="${size * 0.22}" cy="${size * 0.25}" rx="${size * 0.16}" ry="${size * 0.12}" fill="white" opacity="0.95"/>
    <ellipse cx="${size * 0.38}" cy="${size * 0.2}" rx="${size * 0.14}" ry="${size * 0.11}" fill="white" opacity="0.95"/>
    <ellipse cx="${size * 0.3}" cy="${size * 0.28}" rx="${size * 0.12}" ry="${size * 0.09}" fill="white" opacity="0.95"/>
    <!-- 云朵底部 -->
    <rect x="${size * 0.14}" y="${size * 0.25}" width="${size * 0.32}" height="${size * 0.1}" fill="white" opacity="0.95"/>
  </g>
  
  <!-- 通讯录/笔记本 (右下方) -->
  <g transform="translate(${size * 0.32}, ${size * 0.38})">
    <!-- 笔记本主体 -->
    <rect x="0" y="0" width="${size * 0.42}" height="${size * 0.48}" rx="${size * 0.03}" fill="white" opacity="0.95"/>
    
    <!-- 书脊/装订线 -->
    <rect x="${size * 0.02}" y="0" width="${size * 0.04}" height="${size * 0.48}" fill="url(#${gradientId2})" opacity="0.8"/>
    
    <!-- 页面线 -->
    <line x1="${size * 0.1}" y1="${size * 0.12}" x2="${size * 0.38}" y2="${size * 0.12}" stroke="#E5E7EB" stroke-width="${size * 0.015}" stroke-linecap="round"/>
    <line x1="${size * 0.1}" y1="${size * 0.22}" x2="${size * 0.35}" y2="${size * 0.22}" stroke="#E5E7EB" stroke-width="${size * 0.015}" stroke-linecap="round"/>
    <line x1="${size * 0.1}" y1="${size * 0.32}" x2="${size * 0.38}" y2="${size * 0.32}" stroke="#E5E7EB" stroke-width="${size * 0.015}" stroke-linecap="round"/>
    <line x1="${size * 0.1}" y1="${size * 0.42}" x2="${size * 0.32}" y2="${size * 0.42}" stroke="#E5E7EB" stroke-width="${size * 0.015}" stroke-linecap="round"/>
    
    <!-- 人像占位符（联系人图标） -->
    <circle cx="${size * 0.25}" cy="${size * 0.38}" r="${size * 0.05}" fill="url(#${gradientId2})" opacity="0.7"/>
    <ellipse cx="${size * 0.25}" cy="${size * 0.46}" rx="${size * 0.07}" ry="${size * 0.04}" fill="url(#${gradientId2})" opacity="0.5"/>
  </g>
  
  <!-- 装饰点（数据节点） -->
  <circle cx="${size * 0.18}" cy="${size * 0.72}" r="${size * 0.025}" fill="white" opacity="0.6"/>
  <circle cx="${size * 0.28}" cy="${size * 0.78}" r="${size * 0.02}" fill="white" opacity="0.5"/>
  
  <!-- 高光层 -->
  <ellipse cx="${size * 0.3}" cy="${size * 0.2}" rx="${size * 0.25}" ry="${size * 0.08}" fill="white" opacity="0.1"/>
</svg>
`;
};

// 确保目录存在
const ensureDir = (dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

// 生成图标
async function generateIcons() {
  const projectRoot = '/workspace/projects';
  const assetsDir = join(projectRoot, 'client', 'assets', 'icons');
  
  // 确保目录存在
  ensureDir(assetsDir);
  
  console.log('开始生成图标...\n');
  
  for (const { name, size } of SIZES) {
    const svg = createSVG(size);
    
    // Web 用 SVG (保持矢量)
    const webPath = join(assetsDir, `icon-${size}.svg`);
    writeFileSync(webPath, svg, 'utf-8');
    console.log(`✅ 生成 SVG: icon-${size}.svg`);
    
    // Android mipmap PNG
    const mipmapBaseDir = join(projectRoot, 'client', 'android', 'app', 'src', 'main', 'res', `mipmap-${name}`);
    ensureDir(mipmapBaseDir);
    const mipmapPath = join(mipmapBaseDir, 'ic_launcher.png');
    
    await sharp(Buffer.from(svg))
      .png()
      .toFile(mipmapPath);
    console.log(`✅ 生成 PNG: mipmap-${name}/ic_launcher.png (${size}x${size})`);
    
    // 2x/3x 适配图
    if (size === 48 || size === 72 || size === 96 || size === 144 || size === 192) {
      const scale = size === 48 ? 2 : size === 72 ? 2 : size === 96 ? 2 : size === 144 ? 3 : 3;
      const scaledSize = size * scale;
      const scaledPath = join(mipmapBaseDir, `ic_launcher-${scale}x.png`);
      
      await sharp(Buffer.from(svg))
        .resize(scaledSize, scaledSize)
        .png()
        .toFile(scaledPath);
      console.log(`✅ 生成缩放 PNG: mipmap-${name}/ic_launcher-${scale}x.png (${scaledSize}x${scaledSize})`);
    }
  }
  
  // 生成主图标 PNG (512px for all)
  const main512 = join(baseDir, 'icon-512.png');
  await sharp(Buffer.from(createSVG(512)))
    .png()
    .toFile(main512);
  console.log('\n✅ 生成主图标 PNG: assets/icons/icon-512.png');
  
  console.log('\n🎉 图标生成完成!');
  console.log('\n图标设计说明:');
  console.log('- 融合元素: 云朵(左上) + 通讯录/笔记本(右下)');
  console.log('- 配色: 蓝紫渐变 (#4F46E5 → #6366F1 → #8B5CF6)');
  console.log('- 风格: 现代扁平 + 轻微渐变和阴影');
  console.log('- 尺寸: 48/72/96/144/192/512 dp');
}

generateIcons().catch(console.error);
