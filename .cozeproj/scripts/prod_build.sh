#!/bin/bash
set -e

echo "==================== 开始生产环境构建 ===================="

echo "正在安装 Node 依赖..."
pnpm install

echo "正在执行：pnpm run build (server)"
cd server
pnpm run build
cd ..

echo "正在执行：pnpm run build (client)"
cd client
pnpm run build
cd ..

echo "==================== 生产环境构建完成 ===================="
