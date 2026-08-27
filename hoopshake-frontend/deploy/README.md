# 部署指南（Docker + nginx）

一个容器同时托管学生端与教师端，并把 `/api` 反代到后端。前后端**同源**，因此不需要配置 CORS。

```
浏览器 ──► hoopshake-frontend (nginx:80)
             ├─ /student/**  学生端 SPA
             ├─ /teacher/**  教师端 SPA
             └─ /api/**  ──► hoopshake-backend:8080
```

## 一、部署步骤

前提：服务器已装 Docker 与 Compose，后端容器已在本机运行并监听 8080。

```bash
# 1. 上传源码并进入目录
cd hoopshake-frontend

# 2. 确认 docker-compose.yml 里的 BACKEND_ORIGIN 与后端容器名一致
#    默认：http://hoopshake-backend:8080

# 3. 构建并启动
docker compose up -d --build

# 4. 把后端容器接入同一网络（只需做一次）
docker network connect hoopshake-net <后端容器名>

# 5. 验证
curl -i http://localhost/healthz                 # → 200 ok
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/student/   # → 200
curl -s http://localhost/api/auth/me             # → 后端返回的信封（401/40100 也算通）
```

访问地址：

| 端 | 地址 |
|---|---|
| 学生端 | `http://<服务器>/student/` |
| 教师端 | `http://<服务器>/teacher/` |
| 裸域名 | 302 跳转到学生端 |

## 二、和后端对接的两种方式

**方式 A · 共享 Docker 网络（推荐）**

前端按容器名访问后端，后端 8080 不必暴露到宿主机，更安全。

```bash
docker network connect hoopshake-net <后端容器名>
```

`BACKEND_ORIGIN: http://hoopshake-backend:8080`（把主机名换成后端**容器名**）。

若后端也用 compose 管理，更干净的做法是双方共用一个外部网络：

```bash
docker network create hoopshake-net
```

然后两个 compose 文件都写：

```yaml
networks:
  hoopshake:
    external: true
    name: hoopshake-net
```

**方式 B · 走宿主机端口**

后端已把 8080 发布到宿主机（`-p 8080:8080`）时：

```yaml
environment:
  BACKEND_ORIGIN: http://host.docker.internal:8080
extra_hosts:
  - "host.docker.internal:host-gateway"
```

> 方式 B 下 8080 若同时对公网开放，请用防火墙限制，否则前端的鉴权形同虚设。

## 三、SSE（AI 对话、课堂实况）的注意事项

两个功能依赖 `text/event-stream` 长连接。`deploy/nginx.conf.template` 里已经处理：

- `proxy_buffering off` / `proxy_cache off` —— 防止回复「憋住不出字」
- `proxy_read_timeout 3600s` —— 心跳 15s 一次，默认 60s 超时会导致连接被掐断
- **gzip 不包含 `text/event-stream`** —— 压缩是最常见的 SSE 杀手，`gzip_types` 已刻意排除

如果前面还有一层 Nginx / 云负载均衡 / CDN，**同样要在那一层关掉对 `/api/` 的缓冲和压缩**，否则问题会在最外层复现。后端也可以对 SSE 响应返回 `X-Accel-Buffering: no` 作为双保险（本配置已透传该头）。

## 四、HTTPS

推荐让前面的反向代理或云负载均衡终结 TLS，容器只保留 80。若要在本容器内做，把 `443` 端口和证书挂进去，并在 template 里加 `listen 443 ssl;`。

浏览器的 `localStorage` 与 SSE 在 HTTP 下也能用，但生产环境建议上 HTTPS——登录 token 明文传输风险很高。

## 五、升级与回滚

```bash
# 升级：重新构建并滚动替换
docker compose up -d --build

# 回滚：镜像打了版本号，切回上一版即可
# docker-compose.yml 里 image: hoopshake-frontend:1.0.0
docker compose down && docker run -d --name hoopshake-frontend \
  --network hoopshake-net -p 80:80 \
  -e BACKEND_ORIGIN=http://hoopshake-backend:8080 \
  hoopshake-frontend:<上一个版本号>
```

`index.html` 是 `no-cache`、`assets/*` 文件名带 hash 且长缓存，所以发版后用户刷新即可拿到新版，不需要清 CDN。

## 六、改变部署路径

想换成子域名（`student.example.com` / `teacher.example.com`）而不是子路径：

1. 构建参数改成根路径：`STUDENT_BASE=/`、`TEACHER_BASE=/`
2. template 里拆成两个 `server` 块，各自 `server_name` 与 `root`，SPA 回退分别指向自己的 `index.html`
3. `/api/` 的 location 两个 server 块都要有（或用 `include`）

## 七、排查

| 现象 | 原因 |
|---|---|
| 页面 404 / 白屏，静态资源 404 | 构建时 `VITE_BASE_PATH` 与 nginx 的路径前缀不一致 |
| 刷新深链 404 | SPA 回退没生效，检查 `try_files ... /student/index.html` |
| `/api` 502 | 后端容器名不对，或两个容器不在同一网络；`docker network inspect hoopshake-net` 确认 |
| 后端容器重建后一直 502 | 本配置用 `resolver` + 变量已规避 DNS 缓存；若改回静态 `proxy_pass` 会有此问题 |
| AI 回复不逐字出现，等很久一次性出全 | 某一层代理缓冲或压缩了 SSE，见第三节 |
| 登录后立刻被踢回登录页 | 后端 401/40100；检查 token 是否被中间层剥掉了 `Authorization` 头 |
