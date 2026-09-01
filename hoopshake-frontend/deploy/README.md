# 部署指南

一个 nginx 容器同时托管学生端与教师端，并把 `/api` 反代到后端。浏览器只跟前端同源通信，因此**不需要配置 CORS**。

```
浏览器 ──► frontend (nginx:80)
             ├─ /student/**  学生端 SPA
             ├─ /teacher/**  教师端 SPA
             └─ /api/**  ──► backend:8080   （compose 网络内，服务名直连）
```

| 端 | 地址 |
|---|---|
| 学生端 | `http://<服务器>/student/` |
| 教师端 | `http://<服务器>/teacher/` |
| 裸域名 | 302 跳转到学生端 |

---

## 一、CI/CD（GitHub Actions → 阿里云 ACR）

仓库根目录的 `.github/workflows/build.yml` 与后端工作流同构：推 `master` 或 `develop` 时构建并推送镜像。

镜像名：`crpi-fgo4g7v7lir6fd0o.cn-beijing.personal.cr.aliyuncs.com/hoopshake/frontend`

| 分支 | 推送的 tag |
|---|---|
| `master` | `latest` 与 `latest-<7位commit>` |
| `develop` | `develop` 与 `develop-<7位commit>` |

需要在 Settings → Secrets and variables → Actions 配置 `ALIYUN_USERNAME`、`ALIYUN_PASSWORD`（与后端同名；同一账号下配过就不用重复）。

**三点要注意：**

1. **build context 是 `./hoopshake-frontend`** —— 项目在仓库子目录里，而后端的 Dockerfile 在根目录所以那边写的是 `.`。若日后把项目平铺到仓库根目录，把 workflow 里的 `CONTEXT` 改成 `.`。
2. **分支名要对得上** —— 工作流监听 `master`/`develop`。如果这个仓库默认分支是 `main`，推上去不会触发构建。（你 compose 注释里写的是「main 分支构建为 :latest」，但后端工作流里实际是 `master`，建议统一。）
3. 比后端多推了一个带 commit 短 hash 的 tag，为的是让回滚有确定目标——只有 `latest` 的话回滚无处可回。

---

## 二、生产部署（服务器 compose）

服务器上的 `/opt/hoopshake/docker-compose.yml` 里 backend、redis、frontend 同属一个 compose 网络，前端直接从 ACR 拉镜像：

```yaml
  frontend:
    image: crpi-fgo4g7v7lir6fd0o.cn-beijing.personal.cr.aliyuncs.com/hoopshake/frontend:latest
    container_name: hoopshake-frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "80:80"
```

镜像已把 `BACKEND_ORIGIN=http://backend:8080` 作为默认值（用的是 compose **服务名**），所以 **frontend 服务不写 `environment` 也能直接跑通**。若后端服务改名，加一行覆盖：

```yaml
    environment:
      BACKEND_ORIGIN: http://<新的服务名>:8080
```

首次上线与日常更新：

```bash
cd /opt/hoopshake
docker compose pull frontend
docker compose up -d frontend

# 验证
curl -i http://localhost/healthz                                   # → 200 ok
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/student/  # → 200
curl -s http://localhost/api/auth/me                                # → 后端信封（401/40100 也算通）
```

> 后端在 compose 里绑的是 `127.0.0.1:8080:8080`，只对宿主机开放；前端通过 compose 网络的服务名访问容器端口，不走这个映射。这样后端不暴露到公网，是对的。

---

## 三、本地自测

仓库里的 `docker-compose.yml` 是**本地用**的：从源码构建，后端指向宿主机。

```bash
docker compose up -d --build
# → http://localhost/student/  与  http://localhost/teacher/
```

日常开发不必走容器，直接 `npm run dev:student` / `npm run dev:teacher` 更快（见根目录 README）。

---

## 四、SSE（AI 对话、课堂实况）

两个功能依赖 `text/event-stream` 长连接，`deploy/nginx.conf.template` 里已经处理：

- `proxy_buffering off` / `proxy_cache off` —— 防止回复「憋住不出字」
- `proxy_read_timeout 3600s` —— 心跳 15s 一次，默认 60s 超时会掐断连接
- **`gzip_types` 不含 `text/event-stream`** —— 压缩是最常见的 SSE 杀手

如果前面还有一层 Nginx / 云负载均衡 / CDN，**那一层也要对 `/api/` 关掉缓冲和压缩**，否则问题会在最外层复现。后端也可对 SSE 响应返回 `X-Accel-Buffering: no` 作为双保险（本配置已透传该头）。

---

## 五、HTTPS

推荐在宿主机用 nginx/caddy 终止 TLS 再转发到容器 80（你 compose 注释里也是这个思路）。若要在容器内做，挂载证书并在 template 里加 `listen 443 ssl;`。

登录 token 存在 `localStorage`，HTTP 下明文传输，生产环境建议尽快上 HTTPS。

---

## 六、升级与回滚

```bash
# 升级：拉 CI 新推的镜像并滚动替换
cd /opt/hoopshake
docker compose pull frontend && docker compose up -d frontend

# 回滚：改 compose 里的 image 为带 commit hash 的 tag，再起一次
#   image: crpi-.../hoopshake/frontend:latest-a1b2c3d
docker compose up -d frontend
```

可回滚的版本在 ACR 控制台该仓库的 tag 列表里看。

前端产物 `index.html` 是 `no-cache`、`assets/*` 文件名带 hash 且长缓存，所以发版后用户刷新即可拿到新版，不需要清 CDN。

---

## 七、改变部署路径

想换成子域名（`student.example.com` / `teacher.example.com`）而不是子路径：

1. 构建参数改成根路径：`STUDENT_BASE=/`、`TEACHER_BASE=/`
2. template 里拆成两个 `server` 块，各自 `server_name` 与 `root`，SPA 回退分别指向自己的 `index.html`
3. `/api/` 的 location 两个 server 块都要有（或抽出来 `include`）

---

## 八、排查

| 现象 | 原因 |
|---|---|
| 推了代码但没构建 | 分支名不匹配（工作流只认 `master`/`develop`） |
| CI 里 `npm ci` 失败 | `package-lock.json` 与 `package.json` 不同步，本地跑一次 `npm install` 再提交 lock |
| CI 里 `docker build` 找不到 Dockerfile | `CONTEXT` 与项目实际目录不一致 |
| 页面白屏、静态资源 404 | 构建时 `VITE_BASE_PATH` 与 nginx 路径前缀不一致 |
| 刷新深链 404 | SPA 回退没生效，检查 `try_files ... /student/index.html` |
| `/api` 502 | 后端服务名与 `BACKEND_ORIGIN` 不一致，或两个容器不在同一网络；`docker compose ps` 与 `docker network inspect` 确认 |
| 后端容器重建后一直 502 | 本配置用 `resolver` + 变量已规避 DNS 缓存；若改回静态 `proxy_pass` 会有此问题 |
| AI 回复不逐字出现，等很久一次性出全 | 某一层代理缓冲或压缩了 SSE，见第四节 |
| 登录后立刻被踢回登录页 | 后端返回 401/40100；检查中间层是否剥掉了 `Authorization` 头 |
