# 场边镜像：操作台 /console/* + 大屏 /display
# 浏览器只跟本服务同源通信，三类后端请求都由 nginx 反代：
#   /local/**  → 场边本机 edge 服务
#   /ws/**     → 场边本机 WebSocket
#   /api/**    → 云端 boot 服务（登录 / 列课）
# 构建上下文为仓库根：docker build -f docker/edge.Dockerfile .

# ───────────────── 构建阶段 ─────────────────
FROM node:22-alpine AS build
WORKDIR /app

# 先只复制依赖清单，命中 Docker 层缓存
COPY package.json package-lock.json ./
COPY packages/core/package.json   packages/core/
COPY apps/student/package.json    apps/student/
COPY apps/teacher/package.json    apps/teacher/
COPY apps/courtside/package.json  apps/courtside/
RUN npm ci

COPY . .

# 留空 = 前端走相对 /api，由下面的 nginx 反代到云端（推荐，免 CORS）。
# 填绝对地址则浏览器直连云端，需云端放行 CORS。
ARG VITE_CLOUD_BASE_URL=""

# 构建水印里的提交号。CI 传 --build-arg GIT_SHA=$GITHUB_SHA，
# 本地不传就显示 local。水印落在 index.html 的 <meta name="hoopshake-build">，
# 排查「线上是不是旧镜像」时一条 curl 就能看出来。
ARG GIT_SHA=""

RUN VITE_CLOUD_BASE_URL="$VITE_CLOUD_BASE_URL" GITHUB_SHA="$GIT_SHA" npm run build:edge

# ───────────────── 运行阶段 ─────────────────
FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY --from=build /app/apps/courtside/dist /usr/share/nginx/html
COPY docker/edge.nginx.conf.template /etc/nginx/templates/hoopshake-edge.conf.template

# envsubst 只替换这三个前缀的变量，$uri / $host 等 nginx 变量不受影响
#   EDGE_ORIGIN   场边本机服务。容器与 edge 同宿主机时用 host.docker.internal
#                 （Linux 需 --add-host=host.docker.internal:host-gateway）
#   CLOUD_ORIGIN  云端 boot 服务，支持 https（Host 头由 nginx 的 $proxy_host 自动带对）
ENV NGINX_ENVSUBST_FILTER='^(EDGE_|CLOUD_|NGINX_PORT)' \
    EDGE_ORIGIN=http://host.docker.internal:8080 \
    EDGE_RESOLVER=127.0.0.11 \
    CLOUD_ORIGIN=http://backend:8080 \
    NGINX_PORT=80

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
