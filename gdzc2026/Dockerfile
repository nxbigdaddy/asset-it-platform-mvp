# 生产镜像：SQLite 数据在 /app/data/gdzc.db（需挂载卷持久化）
FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci

COPY . .
ENV DATABASE_URL=file:./prisma/build.db
RUN node scripts/set-prisma-provider.mjs && npx prisma generate && npm run build && rm -f prisma/build.db prisma/build.db-journal

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/app/data/gdzc.db

RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3000

# 启动时同步 schema；首次部署后请在容器内执行 seed：docker compose exec app npx tsx prisma/seed.ts
CMD ["sh", "-c", "node scripts/set-prisma-provider.mjs && npx prisma db push && exec node dist/index.js"]
