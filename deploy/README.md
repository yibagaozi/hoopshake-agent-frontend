# 部署指南

一个仓库产出**两个互相独立的镜像**，分别部署在云端服务器和场边主机。

| 镜像 | 内容 | 部署位置 |
|---|---|---|
| `hoopshake-agent-frontend-cloud` | 学生端 `/student/` + 教师端 `/teacher/` | 云端服务器 |
| `hoopshake-agent-frontend-edge` | 操作台 `/console/*` + 大屏 `/display` | 场边主机 |

两套 nginx 的共同设计：**浏览器只跟本服务同源通信**，后端一律由 nginx 反代。
于是三个应用都不需要后端开 CORS，也没有 HTTPS 页面请求 HTTP 接口的混合内容问题；
场边的操作台窗口与大屏窗口同源，`BroadcastChannel` 才能互通。

```
云端服务器                          场边主机
┌────────────────────────┐         ┌─────────────────────────────────┐
│ 浏览器 ──► nginx:80     │         │ 浏览器 ──► nginx:80              │
│   ├ /student/  学生端   │         │   ├ /console/*  操作台           │
│   ├ /teacher/  教师端   │         │   ├ /display    大屏             │
│   └ /api/ ──► backend  │◄────────┤   ├ /api/   ──► 云端 boot（登录） │
│              :8080     │  公网    │   ├ /local/ ──► 本机 edge :8080  │
└────────────────────────┘         │   └ /ws/    ──► 本机 edge（WS）   │
                                   └─────────────────────────────────┘
```

---

## 一、CI/CD（GitHub Actions → 阿里云 ACR）

`.github/workflows/build.yml` 用矩阵一次构建两个镜像，与后端工作流同构。

| 分支 | 推送的 tag |
|---|---|
| `master` | `latest` 与 `latest-<7位commit>` |
| `develop` | `develop` 与 `develop-<7位commit>` |

```
crpi-fgo4g7v7lir6fd0o.cn-beijing.personal.cr.aliyuncs.com/hoopshake/hoopshake-agent-frontend-cloud
crpi-fgo4g7v7lir6fd0o.cn-beijing.personal.cr.aliyuncs.com/hoopshake/hoopshake-agent-frontend-edge
```

需要在 Settings → Secrets and variables → Actions 配置 `ALIYUN_USERNAME`、`ALIYUN_PASSWORD`
（与后端同名，同一账号下配过就不用重复）。

**两点要注意：**

1. **构建上下文是仓库根**（`docker build . --file docker/cloud.Dockerfile`）。
   两个镜像共用同一份 workspace 与 lockfile，所以 Dockerfile 放在 `docker/` 而上下文必须是根目录。
2. **分支名要对得上** —— 工作流监听 `master`/`develop`。若本仓库默认分支是 `main`，
   推上去不会触发构建。（你 compose 注释写的是「main 分支构建为 :latest」，
   而后端工作流实际是 `master`，建议统一。）

---

## 二、云端部署

### 前提

1. CI 已跑过，镜像在 ACR 里（推 `master` 或 `develop` 触发）
2. 宿主机若已有 nginx 占用 80/443（用 `ss -lntp | grep -E ':80 |:443 '` 确认），
   前端容器就**不能再绑 80**，改由宿主机 nginx 反代

### 第 1 步：加入 compose

在 `/opt/hoopshake/docker-compose.yml` 的 services 下加入（内容见
`deploy/docker-compose.cloud.yml`）：

```yaml
  frontend:
    image: crpi-fgo4g7v7lir6fd0o.cn-beijing.personal.cr.aliyuncs.com/hoopshake/hoopshake-agent-frontend-cloud:latest
    container_name: hoopshake-frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "127.0.0.1:8082:80"     # 只对本机开放，外部经宿主机 nginx 进来
```

镜像默认 `BACKEND_ORIGIN=http://backend:8080`（compose **服务名**），
所以不写 `environment` 也能跑通；后端服务改名时才需要覆盖。

### 第 2 步：拉起前端（不影响后端）

```bash
cd /opt/hoopshake
docker compose pull frontend
docker compose up -d frontend      # ← 带服务名，backend / redis 不受影响
```

> 不要用不带服务名的 `docker compose up -d`，那会按整个文件对齐状态，可能顺手重建后端。

自检：

```bash
curl -i http://127.0.0.1:8082/healthz                                    # → 200 ok
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8082/student/  # → 200
```

### 第 3 步：宿主机 nginx 反代

把 `deploy/host-nginx.conf.example` 的 location 部分加进你的 server 块
（或整个 server 块拿去用），核心是这两条：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8082;
    proxy_buffering    off;        # ← SSE 命门，少了 AI 回复会「憋住不出字」
    proxy_read_timeout 3600s;      # ← 心跳 15s/次，默认 60s 会掐断
    gzip off;                      # ← 绝不能压缩 text/event-stream
    # ...（完整头部见示例文件）
}

location / {
    proxy_pass http://127.0.0.1:8082;
    # ...
}
```

容器内部已经做完全部路由（SPA 回退、静态缓存、`/api` → `backend:8080`），
**宿主机这层不要再拆路径**，整体转进去即可，否则两层规则容易打架。

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 第 4 步：验证

```bash
curl -i https://你的域名/healthz
curl -s -o /dev/null -w '%{http_code}\n' https://你的域名/student/
```

浏览器打开 `https://你的域名/student/` 与 `/teacher/`，登录后进 AI 对话页发一条消息，
**看回复是不是逐字出现**——如果卡很久然后一次性全出来，就是某一层缓冲了 SSE，见第四节。

---

## 三、场边部署

场边主机上（前端容器与 edge 服务同机）：

```bash
# deploy/docker-compose.edge.yml
EDGE_ORIGIN=http://host.docker.internal:8080 \
CLOUD_ORIGIN=https://你的云端域名 \
docker compose -f deploy/docker-compose.edge.yml up -d
```

| 变量 | 含义 | 默认 |
|---|---|---|
| `EDGE_ORIGIN` | 本机 edge 服务 | `http://host.docker.internal:8080` |
| `CLOUD_ORIGIN` | 云端 boot 服务（登录/列课） | `http://backend:8080` |
| `WEB_PORT` | 宿主机映射端口 | `8081` |

访问：操作台 `http://<场边主机>:8081/console/live`，大屏 `http://<场边主机>:8081/display`。

**Linux 上必须保留 `extra_hosts: host.docker.internal:host-gateway`**，
否则容器里解析不到宿主机（compose 文件里已经写好）。或者直接用 `network_mode: host`，
那样 `EDGE_ORIGIN` 可以写成 `http://127.0.0.1:8080`。

### ⚠ 关于「页面部署在云端、在场边打开」

如果把 edge 镜像部署到**云端服务器**、让场边设备用浏览器访问，
`/local` 与 `/ws` 会被云端的 nginx 转发到**云端自己**的 `EDGE_ORIGIN`，
**到不了场边主机**（场边通常在 NAT 后面，云端无法反向连接）。

这种形态下只有两个选择，都不推荐：

- 让浏览器直接请求 `http://localhost:8080` —— 会撞上 Chrome 的
  Private Network Access（公网页面访问本地地址需要额外的 preflight 协商），
  云端若是 HTTPS 还会被混合内容拦截；
- 把场边 edge 服务暴露到公网 —— 安全上不可接受。

**所以 edge 镜像请部署在场边主机上。** 它照样从云端 ACR 拉取、照样连云端登录，
只是容器跑在场边那台机器上而已。

---

## 四、长连接：SSE 与 WebSocket

**云端 SSE**（学生端 AI 对话、教师端课堂实况）在 `docker/cloud.nginx.conf.template` 里已处理：

- `proxy_buffering off` / `proxy_cache off` —— 防止回复「憋住不出字」
- `proxy_read_timeout 3600s` —— 心跳 15s 一次，默认 60s 超时会掐断
- **`gzip_types` 不含 `text/event-stream`** —— 压缩是最常见的 SSE 杀手

**场边 WebSocket**（骨架帧、提示流）在 `docker/edge.nginx.conf.template` 里：

- `Upgrade` / `Connection` 头透传，`proxy_read_timeout 1h`
- 同样关闭缓冲

如果前面还有一层 Nginx / 云负载均衡 / CDN，**那一层也要对 `/api/`、`/ws/` 关掉缓冲和压缩、放行 WebSocket 升级**，否则问题会在最外层复现。

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
| 场边 `/local` 502 | `EDGE_ORIGIN` 不对，或 Linux 上缺 `extra_hosts: host.docker.internal:host-gateway` |
| 场边 WS 连不上 / 频繁重连 | 中间层没放行 Upgrade，或读超时太短 |
| 场边登录报跨域 | 说明走了绝对地址：把 `VITE_CLOUD_BASE_URL` 留空（走同源 `/api`），并检查登录页是否手填过地址（存在 localStorage 里，清掉即可） |
| 大屏与操作台不同步 | `BroadcastChannel` 要求同源，确认两个窗口都开在同一个 `http://<主机>:<端口>` 下 |
