# HOOPSHAKE 前端（学生端 + 教师端）

基于 **HOOPSHAKE Cloud API v1.7** 与 Claude Design 设计稿实现的 Vue 3 前端，采用 npm workspaces monorepo：

```
hoopshake-frontend/
├── packages/core        # @hoopshake/core：API 客户端（信封解包 / token 自动刷新 / SSE）、枚举、格式化工具
├── apps/student         # 学生端（移动端 UI，390 设计稿，桌面浏览器居中为手机宽度）
└── apps/teacher         # 教师端（桌面端 UI，含管理员知识库）
```

## 快速开始

要求 Node.js ≥ 18。

```bash
npm install                # 安装全部 workspace 依赖

npm run dev:student        # 学生端 http://localhost:5173
npm run dev:teacher        # 教师端 http://localhost:5174
```

开发服务器把 `/api` 代理到后端。默认目标 `http://localhost:8080`，可在各 app 目录放置 `.env.local` 修改（参考 `.env.example`）：

```bash
# apps/student/.env.local 与 apps/teacher/.env.local
VITE_PROXY_TARGET=http://your-backend:8080   # 开发代理目标
VITE_API_BASE_URL=                            # 生产构建的 API 地址；留空 = 同源
```

生产构建：

```bash
npm run build              # 两个应用一起构建 → apps/*/dist
npm run build:student      # 或分别构建
npm run build:teacher
```

> 两个应用都是 history 路由，部署时需将 404 回退到 `index.html`；若 API 与前端不同源，设置 `VITE_API_BASE_URL` 并在后端开启 CORS。

## 部署（Docker）

一个 nginx 容器同时托管两个应用并反代后端，前后端同源、无需 CORS：

```bash
docker compose up -d --build
docker network connect hoopshake-net <后端容器名>   # 后端跑在同机 docker 的 8080
```

- 学生端 `http://<服务器>/student/`　教师端 `http://<服务器>/teacher/`
- 完整说明见 **[deploy/README.md](deploy/README.md)**（后端对接、SSE 注意事项、HTTPS、升级回滚、排查表）

子路径由构建参数决定：`VITE_BASE_PATH` 同时作用于 Vite 的 `base` 与 vue-router 的 history base，
两处联动，改一个参数即可整体挪位置（缺省为根路径，本地 dev 不受影响）。

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
