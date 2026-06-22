const fs = require('fs');
const { createCanvas } = require('canvas');

const size = 512;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// 背景渐变
const gradient = ctx.createLinearGradient(0, 0, size, size);
gradient.addColorStop(0, '#667eea');  // 蓝紫色
gradient.addColorStop(1, '#764ba2');  // 紫色
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, size, size);

// 画云朵
ctx.fillStyle = 'rgba(255,255,255,0.9)';
ctx.beginPath();
ctx.arc(256, 160, 60, 0, Math.PI * 2);
ctx.arc(320, 160, 50, 0, Math.PI * 2);
ctx.arc(380, 170, 45, 0, Math.PI * 2);
ctx.arc(256, 200, 70, 0, Math.PI * 2);
ctx.fill();

// 画笔记本
ctx.fillStyle = '#ffffff';
roundRect(ctx, 156, 200, 200, 280, 20);
ctx.fill();

// 笔记本线条
ctx.strokeStyle = '#e0e0e0';
ctx.lineWidth = 2;
for (let i = 0; i < 6; i++) {
  ctx.beginPath();
  ctx.moveTo(180, 250 + i * 35);
  ctx.lineTo(332, 250 + i * 35);
  ctx.stroke();
}

// 左侧装订线
ctx.fillStyle = '#667eea';
ctx.fillRect(156, 200, 25, 280);

// 圆形图标
ctx.fillStyle = '#667eea';
ctx.beginPath();
ctx.arc(169, 290, 12, 0, Math.PI * 2);
ctx.fill();

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('assets/images/icon.png', buffer);
fs.writeFileSync('assets/images/icon-512.png', buffer);
fs.writeFileSync('assets/images/adaptive-icon.png', buffer);
fs.writeFileSync('assets/images/ic_launcher_foreground.png', buffer);
fs.writeFileSync('assets/images/splash-icon.png', buffer);
console.log('Icons generated!');
