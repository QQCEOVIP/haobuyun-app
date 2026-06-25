#!/usr/bin/env bash
# 产物部署使用
set -euo pipefail

ROOT_DIR="$(pwd)"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5000}"

# ==================== 工具函数 ====================
info() {
  echo "[INFO] $1"
}
warn() {
  echo "[WARN] $1"
}
error() {
  echo "[ERROR] $1"
  exit 1
}
check_command() {
  if ! command -v "$1" &> /dev/null; then
    error "命令 $1 未找到，请先安装"
  fi
}

# ============== 启动服务 ======================
# 检查核心命令
check_command "pnpm"
check_command "npm"
check_command "npx"

# 先 build client (因为 client/dist 不在 git 仓库)
info "开始构建 client..."
(pushd "$ROOT_DIR/client" > /dev/null && npx expo export --platform web; popd > /dev/null) || error "client build 失败"
if [ ! -d "$ROOT_DIR/client/dist" ]; then
  error "client/dist 目录不存在，build 可能失败"
fi
info "client build 完成！\n"

info "开始执行：pnpm run start (server)"
(pushd "$ROOT_DIR/server" > /dev/null && PORT="$PORT" pnpm run start; popd > /dev/null) || error "服务启动失败"
info "服务启动完成！\n"
