# ───────────────── 构建阶段 ─────────────────
FROM node:22-alpine AS build
WORKDIR /app

# 先只复制依赖清单，命中 Docker 层缓存（源码改动不会重装依赖）
COPY package.json package-lock.json ./
COPY packages/core/package.json   packages/core/
COPY apps/student/package.json    apps/student/
COPY apps/teacher/package.json    apps/teacher/
RUN npm ci

COPY . .

# 两个应用挂在同一域名的不同子路径下
ARG STUDENT_BASE=/student/
ARG TEACHER_BASE=/teacher/
# API 与前端同源（由 nginx 反代 /api），因此留空即可；
# 若前后端分域名部署，构建时传入完整地址并在后端放开 CORS
ARG API_BASE_URL=

RUN VITE_BASE_PATH="$STUDENT_BASE" VITE_API_BASE_URL="$API_BASE_URL" npm run build:student \
 && VITE_BASE_PATH="$TEACHER_BASE" VITE_API_BASE_URL="$API_BASE_URL" npm run build:teacher

# ───────────────── 运行阶段 ─────────────────
FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY --from=build /app/apps/student/dist /usr/share/nginx/html/student
COPY --from=build /app/apps/teacher/dist /usr/share/nginx/html/teacher
COPY deploy/nginx.conf.template /etc/nginx/templates/hoopshake.conf.template

# 官方镜像入口脚本会对 /etc/nginx/templates/*.template 跑 envsubst；
# 用 FILTER 限定只替换 BACKEND_* ，避免 $uri 等 nginx 变量被替换成空
ENV NGINX_ENVSUBST_FILTER=^BACKEND_ \
    BACKEND_ORIGIN=http://hoopshake-backend:8080 \
    BACKEND_RESOLVER=127.0.0.11

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
