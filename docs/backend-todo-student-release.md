# 学生端发布前 · 后端改动清单

> 来源：2026-09-17 对 `apps/student` 的代码审计 + 移动视口实测（含断流、空回复、50310、40311、离线、接口 500、token 过期等失败路径）。
> 本文只列需要后端配合的部分；纯前端的修复见文末第六节。
>
> 说明：以下均从前端视角提出。凡标注「确认或新增」的，可能后端已实现、只是前端未对接；若已存在，回一个路径与字段表即可，不必重做。

## 范围

本轮**做**：修改密码、教师重置密码、激活验证码、资料读回、求助闭环、对话可靠性。

本轮**不做**（已确认）：账号注销、PDF 报告导出、短信自助找回。

---

## 一、新增端点

### 1.1 修改密码

```
POST /api/auth/password
Body: { oldPassword, newPassword }
```

学生激活后当前无任何改密路径（`packages/core/src/api/auth.js` 仅有 login / refresh / logout / me / register / activate）。

错误码需要区分「原密码错误」与「新密码不合规」，前端要据此定位到具体输入框。

解锁：「我的」页新增修改密码入口。

### 1.2 教师重置学生密码

```
POST /api/teacher/students/{studentId}/password/reset
Resp: { initialPassword }
```

复用创建学生时生成初始密码的逻辑，返回新的临时密码由教师转告学生。

待确认：重置后学生账号状态是否回到 `PENDING_ACTIVATION`（即是否需要重新走激活流程），还是保持 `ACTIVE` 仅换密码。建议保持 `ACTIVE`，另给一个 `mustChangePassword` 标记，学生下次登录后强制改密。

解锁：登录页「忘记密码？」当前是假链接（`LoginView.vue:68`，点击只弹一句提示），改为引导学生联系教师；教师端学生详情页新增重置按钮。

### 1.3 激活验证码的下发与查看

已确认方案：验证码由教师指定并线下通知学生，不走短信。据此后端需要：

**a. 创建学生时返回验证码**

```
POST /api/teacher/students
Resp: { studentId, studentNo, username, accountStatus, initialPassword, activationCode }
```

**b. 批量导入时按人返回**

```
POST /api/teacher/lessons/{lessonId}/enrollments
Resp: [{ studentNo, displayName, accountStatus, initialPassword?, activationCode? }, ...]
```

现有实现只取了返回数组的 `length`（`LessonImportView.vue:142`），凭据全部丢弃。新导入的学生因此拿不到登录信息。

**c. 事后可查、可重发**

```
GET  /api/teacher/students/{studentId}            # 响应中带 activationCode（仅未激活时有值）
POST /api/teacher/students/{studentId}/activation-code/reset
Resp: { activationCode }
```

学生丢失验证码时教师需要能查回或重新生成。

**d. 激活接口改为强校验**

```
POST /api/auth/activate
Body: { phone, newPassword, verifyCode }   # verifyCode 由选填改为必填
```

验证码错误需要一个独立错误码（建议 40112 或同类），前端据此提示「验证码不正确，请与老师核对」，而不是笼统的参数错误。若验证码设有效期，过期也需独立错误码。

**关联的现存缺陷（前端侧，一并说明）**：教师端创建学生成功后，界面只提示「系统已生成初始密码，请通过学校渠道告知学生」，**但没有把密码本身显示出来**（`StudentsView.vue:232-241`）。教师不填初始密码时，该学生实际无法登录。前端会补上明文展示与复制按钮，前提是 1.3a 的响应确实带 `initialPassword`。

### 1.4 学生端读回身体档案

```
方案首选：/api/auth/me 的响应中补 dominantHand / heightCm / legLengthCm
方案备选：新增 GET /api/student/profile
```

当前 `PUT /api/student/profile` 可写，但没有任何接口可读。前端只能把写入的返回值缓存在本机 localStorage（`apps/student/src/stores/auth.js` 的 `profileExtra`），换设备登录即丢失。

`legLengthCm` 标注为「用于 3D 动作分析」，若算法确实依赖，学生换设备等于静默清空该参数。

前端已经在读 `me.dominantHand` 等字段，若 `/api/auth/me` 已返回则本条视为已完成，回复确认即可。

---

## 二、已有端点补字段或改行为

### 2.1 `GET /api/student/data/overview` 的 `focusCheckpoint`

实测返回 `label: "ft.release.elbow"`，即 label 被回填成了 id，学生端界面直接显示这串英文。与此前场边 `actionLabel` 回填成 `actionType` 是同一类问题。

要求：

- `label` 给中文，或者**不给这个字段**。不要给一个等于 id 的值，前端无法分辨「这是名字」还是「这是 id」。
- 补 `checkpointId` 字段。有它前端可查 `/api/meta/vocabulary` 自行兜底。
- 明确 `improvementPct` 语义：`null` 表示无上周数据不可比，`0` 表示确实持平。当前前端把 `null` 渲染成「较上周改善 +0% · 继续保持」，等于凭空给出结论。

### 2.2 `GET /api/student/data/sessions/{sessionId}` 补总数

补 `feedbackCount`，与已有的 `clipCount` 对齐。

原因：报告页顶部「出手 120」取自 `detail.clipCount`，「命中率 66%」却由前端拿第一页 100 条 clips 算出，同屏两个数字分母不同。前端需要知道自己是否只拿到了部分数据。

若第三节的 report 端点开放，本条可由其替代。

### 2.3 求助工单的状态与回复

`GET /api/student/help-requests` 已存在但学生端从未调用，因为不知道返回结构。学生提交「请求老师当面指导」后无法看到任何后续，闭环只做了一半。

学生端列表每条需要：

| 字段 | 说明 |
|---|---|
| `requestId` | |
| `question` | 提交时的问题 |
| `createdAt` | |
| `status` | 枚举需定死，见 3.2 |
| `teacherName` | 处理人 |
| `reply` | 教师回复正文 |
| `handledAt` | |

教师端 `POST /api/teacher/help-requests/{requestId}/handle` 目前前端只敢发 `{ reply }`，因为字段表未定。两端需一起确定。

### 2.4 会话改为在 ask 时创建

当前流程是前端先 `POST /sessions` 建会话，再 `POST /ask`。ask 失败时会话已落库，学生的「对话记录」里留下一条零消息的「未命名对话」。已实测复现。

建议：`ask` 支持不带 sessionId（或 `sessionId: null`），由后端在真正开始生成时创建会话，并在 `meta` 事件中回传 `sessionId`。

此方案从根上解决问题，比前端做事后清理可靠。

### 2.5 消息需要能分辨「完整」与「被截断」

这是学生端最严重的问题的解法。

实测现象：SSE 流中途断开时，学生看到的是半句话，没有任何提示、标记或重试入口，与正常回答在界面上完全一致。移动端断流是常态（锁屏、切换网络、信号盲区）。

需要两件事：

**a.** `GET /sessions/{sessionId}/messages` 每条 assistant 消息带 `finishReason` 或 `status`，取值至少覆盖 `stop` / `interrupted` / `error` / `truncated`。学生重新进入会话时，前端据此标注「回答未完成」。

**b.** 明确一个行为：**客户端断开后，服务端的生成是继续还是中止？**

- 若**继续**：前端断线后重新拉取 messages 即可拿到完整答案，体验最好，前端按此实现恢复逻辑。
- 若**中止**：前端只能提供「重新生成」按钮，则需要下一条的幂等键。

这个答案决定前端的实现方向，请优先回复。

### 2.6 ask 的幂等键

依赖 2.5b 的答案。若需要「重新生成」，建议 `ask` 请求体接受 `clientMsgId`（前端生成的 UUID），同一 id 重复提交时不重复计入 token 预算、不重复落库。

否则学生在弱网下反复点重试会快速耗尽配额。

### 2.7 5xx 不要透出内部消息

实测用 `{"code":50000,"message":"boom"}` 时，`boom` 原样弹到了学生手机上。建议 5xx 统一返回用户可读文案，细节保留在 `traceId`。

---

## 三、需要确认口径的问题

前端不做猜测，以下均需后端给出明确答复。

### 3.1 `clipDetail.phases[]` 的字段命名

是 `start_ms` / `end_ms`（蛇形），还是 `startMs` / `endMs`（驼峰）？

前端同一个弹层内两种写法都有。实测两种都发一遍：驼峰那条显示为 `— – —`。若后端与其它字段一致使用驼峰，则当前所有相位时间均为空白。

给一个真实 payload 即可。

### 3.2 `help-request` 的 `status` 枚举与 `handle` 请求体

教师端当前在猜测，识别 `HANDLED` / `RESOLVED` / `CLOSED` / `DONE` / `REPLIED` 五个候选值，识别不出就按未处理显示（见 `LessonsView.vue:45` 的注释）。学生端要展示状态，必须定死枚举全集。

同时给出 `POST .../handle` 的完整字段表。

### 3.3 `clips` / `feedback` 的 `size` 上限

决定前端是循环翻页还是单次请求较大页。

### 3.4 `focusCheckpoint.progress` 的取值范围

0–1 还是 0–100？前端目前两种都兼容，但这种模糊是隐患。

### 3.5 `/api/auth/me` 的 `status` 字段是否稳定返回

学生端靠 `status === 'PENDING_ACTIVATION'` 决定是否展示激活引导。

### 3.6 `GET /api/student/data/sessions/{sessionId}/report` 当前是否开放

前端已定义该方法但从未调用。报告页现在自行用 clips 与 feedback 推导命中率与检查点评分，且采用的是「以本课最差检查点归一化」的相对口径，结果偏保守：实测两个检查点提示次数相同时，双双标为「需改进」。

若该端点已开放，请给字段表，前端整段替换这套推导；若未开放，请告知计划，前端先补上翻页顶替。

---

## 四、建议但不阻塞发布

| 项 | 说明 |
|---|---|
| AI 配额余量 | 学生只在用完那一刻才看到「今日 AI 用量已用完」，此前无任何预警。建议在 `meta` 事件或 `GET /api/student/chat/quota` 中给出剩余量 |
| 登录限流 | 学号为 10 位连号，无限流等于可撞库 |
| 报告列表的 `from` / `to` | 接口签名中已有，确认可用后前端补上日期筛选 |

---

## 五、本轮不做

| 项 | 决定 |
|---|---|
| 账号注销 | 暂不做。注意：若后续要上架应用商店或小程序，这是强制项，且需要配套的数据处置口径（训练数据、动作片段、人脸底库、对话记录分别删除还是匿名化） |
| PDF 报告导出 | 暂无。前端会把报告页底部「生成 PDF 报告」主按钮置灰，避免点击后才提示未开放 |
| 短信自助找回密码 | 暂不做，改用 1.2 的教师重置方案 |

---

## 六、前端自行处理（不需要后端）

概览页三处错误显示（趋势箭头写死向上、检查点显示英文 id、null 渲染成 +0%）；报告页翻页与计数一致性；断流后的提示与重试 UI；接口失败时的错误态与重试（当前会渲染成「你还没训练过」）；失败后残留的空气泡；对话页缺失的底部 TabBar；PDF 按钮置灰；原生 `confirm` / `prompt` 替换为 BottomSheet；教师端创建学生后展示初始密码与验证码；HTTP 跳 HTTPS 与 HSTS；CSP；PWA manifest 与 apple-touch-icon；软键盘遮挡输入框的 viewport 配置；ESLint 与单元测试。

---

## 七、最小启动集

若后端需要排优先级，以下三项卡着前端最影响体验的修复：

1. **1.4** 学生端读回身体档案
2. **2.1** `focusCheckpoint` 不要把 label 回填成 id
3. **2.5b** 回答「客户端断开后生成是否继续」

第 3 项只需一句话答复，但决定了对话可靠性整块的实现方向。
