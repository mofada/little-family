# 构建 React Web
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY ../.. .

RUN npm ci
RUN npm run build:web

# 使用 Caddy 托管静态文件
FROM caddy:2-alpine

COPY --from=builder /app/apps/web/dist /srv

EXPOSE 80
