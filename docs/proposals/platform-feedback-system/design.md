# OPT-008 平台用户反馈系统

状态：Completed

关联：[总计划](plan.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md) · [优化事项总清单](../optimization-intake/README.md)

## 背景与当前问题

正式实施基线为 `main@67620082f43f2e608f24a5d301bb5adacbfc887f`，任务分支为 `codex/opt-008-feedback-system`，风险分级为 **R3**。

最新源码核验确认 Feedback 仍是空白领域：Admin 只有 Overview 规划卡；Account/Admin OpenAPI、Account API、迁移与 pgTAP 都没有 Feedback operation、表或领域函数。Consumer Harness 已经是 canonical Account HTTP contract 的独立消费者，可继续扩展。现有 `platform_config_files` 和 `platform-config-files` bucket 的成熟状态机只属于 Config/legacy file，不能把反馈图片塞进同一表、同一 bucket 或同一容量预算。

共享 Storage adapter 当前只允许 `platform-config-files`。本任务只把它扩展为受控 bucket union，不开放任意 bucket 字符串。Global Delete / account retention 已有固定 checkpoint 与领域入口，Feedback 必须接入这些入口，而不是另起一套身份删除流程。

Supabase 当前约束继续采用：private bucket 不公开对象；服务端经 Storage API 操作对象；不能直接操作 `storage` schema metadata 来冒充对象删除；数据库备份不包含 Storage object bytes。因此本设计不把数据库行删除写成图片删除成功，也不把数据库备份写成“附件已备份”。

## 目标与范围

1. 新增平台级 Feedback 领域，Consumer 经自身同源 BFF 调 canonical Account API 提交文字反馈和受控图片。
2. 平台、平台账户、用户身份来自服务端上下文；联系邮箱由服务端 Auth 读取并在提交时快照，浏览器不能声明归属或邮箱。
3. 单平台 Admin 新增 `/admin/platforms/:platformId/feedback`，支持服务端筛选、详情、图片、状态、标签、内部备注、联系邮箱复制、CSV 导出和批量删除。
4. Feedback 删除与图片物理删除分离：内容先 fail closed，附件异步 cleanup，只有 Storage 删除已确认才收敛 `deleted`。
5. Global Delete / retention 复用同一个 Feedback privacy/delete helper；Overview 使用权威 pending Feedback 聚合。
6. 同步 Account/Admin OpenAPI、Consumer Harness、Consumer Lab、onboarding、architecture/reference 与真实 Local E2E。

非目标：匿名反馈、邮件代发、第三方客服 SaaS、图片 ZIP 导出、SVG/任意文件、浏览器直连 Storage、外部全文搜索服务和伪造对象备份。

## 数据模型

### `public.platform_feedback`

核心字段：`id/platform_id/platform_account_id/user_id`，提交时 display-name/email 快照，`contact_allowed`，`category`，`title/body`，`flagged`，受控 `client_context`，`row_version` 与生命周期时间。

状态固定为：`draft | new | reviewing | planned | resolved | closed | deleting | deleted`。

只有 `draft` 可由 Consumer 修改/补附件；`submit` 原子校验全部附件 active 并转为 `new`。进入 `deleting` 后正文、联系信息、client context、标签和内部备注立即最小化并从普通读取中消失；`deleted` 只保留必要墓碑事实。

### `public.platform_feedback_attachments`

独立图片对象 ledger，不引用 `platform_config_files`。包含 feedback/platform/account 归属、固定 bucket/path、原始名/MIME、声明与实际字节、SHA-256、lease/fence、写入与删除重试证据。

状态：`pending | receiving | storing | active | deleting | deleted | failed | expired`。

write outcome：`not_started | in_flight | confirmed | unknown | settled_absent`。

首版限制：最多 5 张；每张 `1..4 MiB`；总附件不超过 `12 MiB`；只允许 `image/jpeg`、`image/png`、`image/webp`。服务端必须验证真实大小与文件 magic，不信任浏览器 Content-Type/Content-Length。bucket 同时设置 4 MiB 和允许 MIME 作为第二道边界。

### 标签与事件

- `platform_feedback_labels(feedback_id, label)`：每条最多 10 个，每个 1–32 字符，服务端规范化。
- `platform_feedback_events`：append-only 管理时间线，记录 submit/status/labels/note/delete 等；内部备注正文只存在受保护事件字段，不进入 `audit_logs.metadata`。
- Global Delete/retention 会清空 note body，但保留事件类型和时间。

## Storage 与 Consumer 流程

专用 private bucket：`platform-feedback-attachments`。对象路径固定为 `platform_id/platform_account_id/feedback_id/attachment_id`，永不复用。

```text
POST /v1/feedback -> draft
POST /v1/feedback/:id/attachments/upload-intent -> attachment pending
PUT /v1/feedback/:id/attachments/:attachmentId/content
  pending -> receiving -> storing -> active
POST /v1/feedback/:id/submit
  draft + all attachments active -> new
```

`unknown` 不是失败。未证明写入不存在时不复用路径、不启动第二个并发 PUT，也不假定对象不存在。

## Account API

新增 additive v1 operations：

- `GET /v1/feedback`
- `POST /v1/feedback`（`Idempotency-Key`）
- `GET /v1/feedback/{feedbackId}`
- `PATCH /v1/feedback/{feedbackId}`（draft-only，`If-Match`）
- `POST /v1/feedback/{feedbackId}/attachments/upload-intent`（`Idempotency-Key`）
- `PUT /v1/feedback/{feedbackId}/attachments/{attachmentId}/content`
- `DELETE /v1/feedback/{feedbackId}/attachments/{attachmentId}`（draft-only）
- `POST /v1/feedback/{feedbackId}/submit`

Consumer 不提交 `platform_id/platform_account_id/user_id/email/status/labels`。`client_context` 只接受 `app_version/route/locale/timezone/os/browser` 白名单与长度上限，不接受 headers、token、URL query dump 或自由 metadata。

submit 从当前 Bearer 对应 Auth user 服务端读取 email；Auth 暂时不可用时 fail closed，draft 保留可重试。

## Admin API 与页面

列表在 SQL 分页前组合 `q/status/category/label/user/email/has_attachments/from/to`。一级信息围绕提交时间、用户、摘要、category/status、labels、附件数和 flagged；详情返回完整正文、联系快照、受控附件、client context、timeline 和 row version。

管理写操作：

- status 按显式状态机更新，要求 reason、event 和 Audit；
- labels 整集合替换并用 If-Match 防并发覆盖；
- internal note append-only；
- flagged 受控更新；
- batch delete 最多 100 条同平台记录，recent-MFA + reason + operation id，返回 accepted/current status；
- export 按 selected ids 或完整筛选条件在服务端生成 CSV，不只导出当前浏览器分页；对公式前缀安全转义；Audit 不写正文/邮箱。

Admin 附件通过受控二进制端点读取，不生成永久 public URL。

## 删除、Global Delete 与 retention

统一 `feedback_delete_request` / `feedback_account_privacy_cleanup`：

1. Feedback 立即 `deleting`，清空正文、邮箱、client context、labels 和 note body；普通读取 fail closed。
2. 未 deleted 附件进入 `deleting`，保留 write outcome/lease/fence。
3. Maintenance 使用专用 candidate/claim/finish，通过 Storage API 删除对象。
4. 全部附件 `deleted` 后 Feedback reconciliation 收敛 `deleted`，断开身份引用并保留最小墓碑。
5. Global Delete 的现有 `files_blocked` checkpoint 与 account retention cleanup 调用同一 helper，不增加新 checkpoint。

普通 Account Close 不立即物理清理历史反馈；关闭状态阻止新提交，后续 retention 或 Global Delete 执行隐私删除。

## 备份与恢复

数据库恢复边界包含 Feedback、attachment metadata、labels/events 与删除状态；Storage object bytes 不属于数据库备份。没有可证明的外部附件对象备份时，Admin 不展示“已备份”。物理删除需要继续尊重现有 backup barrier，避免恢复窗口内删除对象。

## 风险与取舍

- 邮箱只信服务端 Auth 结果；Auth 不可用时 submit fail closed。
- 只接受 JPEG/PNG/WebP 并校验 magic；SVG/HTML 不进入预览链。
- Storage 与数据库跨网络不可原子，必须保持 unknown/lease/fence/retry。
- Feedback 正文和 note 可能含个人信息，Global Delete/retention 必须最小化，而不是只置空 user id。
- CSV 首版不打包图片，避免同步构造超大 ZIP。
- 列表筛选留在 SQL；不为未知流量提前引入搜索服务。

## 验收条件

- Local fresh + non-empty upgrade、RLS/privilege、跨平台 IDOR、并发/unknown/delete/backup barrier/retention/global-delete 回归全绿。
- Account OpenAPI additive，`contracts:breaking` 无既有 v1 breaking；Consumer Harness 覆盖文字、图片、非法 MIME/超限、submit、跨平台拒绝。
- Admin 真浏览器覆盖筛选、详情图片、status/labels/note、CSV、MFA delete、处理中/失败恢复、窄屏/键盘/空态/错误态。
- Overview pending Feedback 来自权威聚合，不从有界列表计算。
- private bucket、server-only Storage Secret 与 Storage API 删除边界保持成立。
- architecture/reference/onboarding/DESIGN 同步最终事实；Production 未授权时 NOT_RUN。

## 待确认项

无阻塞性待确认项。邮件代发、ZIP 图片导出、匿名反馈、对象备份介质与全文搜索服务留作后续独立范围。
