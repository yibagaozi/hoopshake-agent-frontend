# HOOPSHAKE 前端 monorepo

基于 **HOOPSHAKE Cloud API v1.7** 与 Claude Design 设计稿实现的 Vue 3 前端，
一个仓库承载云端与场边两套产品，共用同一份 API 客户端与设计令牌。

```
.
├── packages/core        # @hoopshake/core：信封解包 / token 刷新 / SSE / 词表 / 格式化 / Markdown
├── apps/student         # 云端 · 学生端（移动端 UI）
├── apps/teacher         # 云端 · 教师端（桌面端 UI，含管理员知识库）
├── apps/courtside       # 场边 · 教师操作台 + 课堂大屏
├── docker/              # 两个镜像各自的 Dockerfile 与 nginx 模板
├── deploy/              # 部署指南与两份 compose
└── .github/workflows/   # 推 master/develop 构建并推送两个镜像
```

产出两个互相独立的镜像：

| 镜像 | 内容 | 部署位置 | 页面 |
|---|---|---|---|
| `hoopshake-agent-frontend-cloud` | 学生端 + 教师端 | 云端服务器 | `/student/` `/teacher/` |
| `hoopshake-agent-frontend-edge` | 操作台 + 大屏 | 场边主机 | `/console/*` `/display` |

## 快速开始

要求 Node.js ≥ 18（CI 与镜像用 22）。

```bash
npm install                # 一次装齐所有 workspace

npm run dev:student        # 学生端    http://localhost:5173
npm run dev:teacher        # 教师端    http://localhost:5174
npm run dev:courtside      # 场边      http://localhost:5173（另一个端口，见其 .env）

npm run mock:edge          # 场边 edge 接口的本地 mock，跑在 8080
```

后端地址：

```bash
# apps/student/.env.local 与 apps/teacher/.env.local
VITE_PROXY_TARGET=http://your-backend:8080    # dev 时 /api 代理目标

# apps/courtside/.env.local
VITE_EDGE_ORIGIN=http://127.0.0.1:8080        # 本机 edge 服务
VITE_CLOUD_PROXY_TARGET=http://127.0.0.1:8080 # 云端服务（走相对 /api 时）
VITE_CLOUD_BASE_URL=                          # 留空 = 同源相对路径（推荐，免 CORS）
```

构建：

```bash
npm run build          # 三端全部
npm run build:cloud    # 学生端 + 教师端
npm run build:edge     # 场边
```

## 部署

```bash
docker compose -f deploy/docker-compose.cloud.yml up -d   # 云端服务器
docker compose -f deploy/docker-compose.edge.yml  up -d   # 场边主机
```

两套 nginx 都把浏览器需要的后端反代到**同源**之下，因此三个应用都不需要后端开 CORS：

- 云端镜像：`/api` → compose 服务名 `backend:8080`
- 场边镜像：`/local` `/ws` → 本机 edge 服务；`/api` → 云端 boot 服务

完整说明见 **[deploy/README.md](deploy/README.md)**（CI、两种部署形态、SSE/WebSocket 注意事项、HTTPS、升级回滚、排查表）。

## 功能覆盖（对照 API v1.7）

### 学生端 `apps/student`（STUDENT）
| 页面 | 说明 | 接口 |
|---|---|---|
| 登录 | 学号/用户名/手机号登录；非学生角色拦截 | `POST /api/auth/login` |
| 激活账号 | 两步流程：①学号+初始密码核对（登录）→ ②绑定手机+设置新密码 → 自动重登 | `POST /api/auth/activate` |
| 训练概览 | 问候、本周三格（训练/出手/命中率）、命中率趋势（可切动作）、本阶段重点、最近课堂 | `GET /api/student/data/overview` `GET …/trend` |
| 对话教练 | SSE 流式回复（meta/tool/delta/done/error）、打断、追问建议 chips、会话历史（新建/重命名/删除）、40311 未激活引导 | `POST …/ask`(SSE) `POST …/interrupt` 等 |
| 训练报告列表 | 课堂记录分页列表 | `GET /api/student/data/sessions` |
| 课堂报告 | 出手/命中率/关键改进统计条、检查点表现（由反馈聚合）、教练提示（重点反馈 cue）、出手片段（详情弹层：阶段/出手时刻/3D 数据下载）、课堂反馈流；PDF 导出为 🚧 灰置 | `GET …/sessions/{id}` `…/clips` `…/feedback` `…/clips/{clipId}` |
| 我的 / 编辑资料 | 账号信息、惯用手/身高/腿长维护 | `GET /api/auth/me` `PUT /api/student/profile` |

### 教师端 `apps/teacher`（TEACHER / ADMIN）
| 页面 | 说明 | 接口 |
|---|---|---|
| 登录 / 注册 | 深色品牌分栏设计；注册处理 50100（未开放）、40300（邀请码）、40901 | `POST /api/auth/register` |
| 课程管理·概览 | 课程卡片网格、状态筛选、搜索、新建课程（动作/检查点可自定义） | `GET/POST /api/teacher/lessons` |
| 课程详情 | 概况条、开始上课/结束课程、功能入口卡片；**课堂实况**（进行中显示）：SSE 快照/实时反馈/安全警报/会话状态，断线自动重连 | `POST …/status` `GET …/live` `GET …/live/stream`(SSE) |
| 课程配置 | 课程信息行内编辑、训练动作 chips、检查点开关（安全类标识）；仅 PLANNED 可改（40910 提示） | `PUT /api/teacher/lessons/{id}` |
| 批量导入学生 | 粘贴/CSV 上传 → 本地解析（10 位学号校验/去重）→ **预检**（新建/入班/已在班/无效）→ 确认导入；含 CSV 模板下载 | `POST …/enrollments/preview` `POST …/enrollments` |
| 学生名单（班级） | 参课名单 + 账号状态 + 识别底库 + 并发拉取每人训练统计（命中率/出手）、移出班级 | `GET …/enrollments` `GET /api/teacher/students/{id}/stats` |
| 学生 / 学生详情 | 全局学生检索分页、新建学生（展示初始密码提示）、资料编辑、分动作表现、识别底库信息；识别纠正 🚧 | `/api/teacher/students/**` |
| 课末汇总 | 出勤/动作数/命中率/安全四格、检查点分布柱图、安全提醒、学生表（迷你趋势线/识别状态）、AI 班级小结（Markdown 渲染）；导出 🚧 | `GET /api/teacher/summary/sessions/{id}` |
| 备课工作台 | 🚧 按设计稿摆好版式 + 未开放遮罩，可一键探测接口状态 | `/api/teacher/plan/**` → 50100 |
| 教学助手 | 🚧 会话列表 + 对话区占位、输入禁用，可一键探测接口状态 | `/api/teacher/chat/**` → 50100 |
| 知识库管理（ADMIN） | 文档列表（PROCESSING 自动轮询）、Markdown 导入、重建索引、删除、检索测试（topK） | `/api/admin/knowledge/**` |

### 通用能力（packages/core）
- **信封解包**：`{code,message,data,traceId}`，`code=0` 取 `data`，非 0 抛 `ApiError`（含 fieldErrors）。
- **Token 管理**：`40101` 自动 refresh（单飞）并重放原请求；`40100/40103` 清理登录态并跳登录。学生端与教师端使用不同的 localStorage key，可同时登录。
- **SSE 客户端**：基于 fetch（支持 `Authorization` 头与 POST 体），解析 `event:/data:`、忽略 `: ping` 心跳，`error` 事件与信封错误统一处理，SSE 连接同样支持 40101 刷新重试。
- **错误码 → 中文文案** 全量映射（40110 账密错、40311 未激活、42910 Token 预算用尽、50100 未开放…）。
- **Markdown 渲染**：`renderMarkdown()` 支持标题/有序无序列表/加粗斜体/行内代码/代码块/引用/链接/段落内换行。
  块级结构在原文上识别、文本一律转义后再拼标签，不接受任何原始 HTML，链接只放行 http/https，
  因此模型返回的内容无法注入脚本；流式过程中半截语法（未闭合的 `**` 或代码块）也能安全降级。
  用于学生端 AI 回复气泡与教师端 AI 班级小结。

## 已知取舍（与后端约定）

- **词表接口 🚧**（`/api/meta/vocabulary` 返回 404/50100）：训练动作与检查点在前端提供常用候选 + 自定义输入，并内置常见 id 的中文映射（`packages/core/src/enums.js` 的 `ACTION_LABELS` / `CHECKPOINT_LABELS`，未命中时原样显示 id）。接口开放后改为动态拉取即可，调用点统一走 `actionLabel()` / `checkpointLabel()` / `isSafetyCheckpoint()`。
- **学生报告页的命中率** 由 `clips` 的 `shotMade` 统计得出；**检查点表现**没有绝对评分接口，采用本课反馈的**相对**比较（扣分权重 MAJOR=1 / MINOR=0.5，以本课最差检查点归一化，无负面反馈记满分），卡片上标注了口径并显示真实提示次数。报告接口（🚧）开放后可整体替换这段推导。
- **激活流程**：设计稿为“学号+姓名”核对；API 无该核验接口，实际以“学号+初始密码登录（PENDING_ACTIVATION）→ 绑定手机+新密码激活”落地。
- **批量导入**：API 仅接收 `studentNo/displayName`，Excel 请先另存为 CSV（或直接粘贴文本）。
- **课末汇总入口**：教师侧没有“会话列表”接口，入口通过课程实况的 `activeSession` 或手动粘贴 sessionId 进入。
