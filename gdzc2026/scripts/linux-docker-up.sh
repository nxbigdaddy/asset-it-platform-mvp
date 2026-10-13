#!/usr/bin/env sh
# 在 Linux 服务器上、项目根目录执行：构建并后台启动（需已安装 Docker / docker compose）
set -e
cd "$(dirname "$0")/.."
if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker，请先安装 Docker Engine。"
  exit 1
fi
docker compose up -d --build
echo ""
echo "已启动。首次部署请执行初始化账号（可选）："
echo "  docker compose exec app npx tsx prisma/seed.ts"
echo "访问: http://<本机IP>:3000  默认管理员见 README（生产请改密）"
