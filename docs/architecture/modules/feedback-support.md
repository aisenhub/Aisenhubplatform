# Feedback 与支持工作流架构

Feedback 是独立的用户支持领域，不复用 Config file 表、bucket 或配额。文本、联系信息、图片附件、Admin 状态/标签/内部备注和删除恢复均有独立领域语义。

## Requirements

本模块主要承担 [Feedback 与支持需求](../../spec/feedback-support.md) `REQ-FBK-001` ～ `REQ-FBK-009`，并共同满足 `REQ-SYS-001`、`REQ-SYS-002`、`REQ-SYS-004` ～ `REQ-SYS-006`、`REQ-SYS-008`、`REQ-SYS-009`。

## 1. 根对象

`public.platform_feedback` 关键字段：

- platform/account/user；
- author display-name snapshot；
- contact allowed + email snapshot；
- category：`bug | idea | experience | other`；
- title/body；
- `flagged`；
-受控 client context；
- `row_version`；
- submit/resolve/delete timestamps。

状态：

`draft | new | reviewing | planned | resolved | closed | deleting | deleted`

只有 draft 允许 Consumer 修改正文/附件。提交时服务端原子检查附件并转 new：任何仍处于 pending/receiving/storing/deleting 等非终态的附件都会阻止提交；active 附件必须是已确认写入，已经取消/失败/过期的终态附件不再作为待提交附件阻塞流程。

## 2. 身份与快照

Feedback 的 `platform_id/platform_account_id/user_id` 全部来自已验证 Principal，不接受浏览器声明。

提交时联系邮箱由服务端根据当前 Auth user 读取并快照；浏览器不能伪造 email 归属。Auth 临时不可用时 submit fail closed，保留 draft 可重试。

email snapshot 是“提交当时的联系事实”，不能反向当作当前 Global Identity email。

## 3. Client Context

只接受固定允许列表：

- app version；
- route；
- locale；
- timezone；
- OS；
- browser。

字段值必须是字符串；`route` 最长 512 字符，其余允许字段最长 256 字符。不接受无界 metadata、请求 headers、Token、完整 URL query dump 或其他潜在 Secret。

## 4. 图片附件

`public.platform_feedback_attachments` 使用独立 private bucket：

`platform-feedback-attachments`

对象路径固定绑定 platform/account/feedback/attachment，删除后不复用。

限制：

- 每条 Feedback 最多 5 张；
- 单图 1–4 MiB；
- 总附件 <= 12 MiB；
- MIME 仅 `image/jpeg | image/png | image/webp`；
- Account API 校验真实 bytes 与 magic，不信任浏览器 Content-Type。

附件状态：

`pending | receiving | storing | active | deleting | deleted | failed | expired`

write outcome：

`not_started | in_flight | confirmed | unknown | settled_absent`

与 Config 一样，`unknown` 不是失败。

## 5. 附件写入账本

`private.feedback_attachment_write_attempts` 记录：

- platform/attachment；
- fence；
- in-flight/confirmed/unknown/settled_absent；
- provider request ID；
- actual bytes/hash；
- error；
- started/settled time。

外部 Storage 网络调用不在 DB 事务中。数据库 fence 防止旧 worker 写状态，但不能取消已经发送的 Storage 请求。

## 6. Consumer 流程

典型流程：

```text
POST /v1/feedback             -> draft
PATCH /v1/feedback/:id        -> draft content
POST attachment upload-intent
PUT attachment content
POST /v1/feedback/:id/submit  -> new
```

创建和 upload-intent 使用 Idempotency-Key；draft PATCH 使用 `If-Match`。Submit 必须确认所有附件 active/confirmed。

跨账户/跨平台 Feedback 统一不泄露对象存在性。

## 7. 标签与事件

`platform_feedback_labels`：每条最多 10 个 label；服务端 trim、lower-case、去重，每个 label 1–32 字符且拒绝控制字符。

`platform_feedback_events` append-only 时间线：

- submitted；
- status_changed；
- labels_changed；
- note_added；
- flag_changed；
- delete_requested；
- deleted。

内部 note 正文保存在受保护 event 字段，不复制到通用 `audit_logs.metadata`。

## 8. Admin Feedback Center

Platform Admin 页面 `/admin/platforms/:platformId/feedback` 支持：

- 服务端 cursor pagination；
- q/status/category/label/user/email/has_attachments/from/to 等组合筛选；
- detail Inspector；
- private attachment proxy；
- status / labels / flag；
- internal note；
- contact email copy；
- CSV export；
- batch delete。

筛选必须在 SQL 分页之前执行，不能对当前浏览器页前端过滤冒充全量。

## 9. 并发与 mutation

Feedback root 使用 `row_version`。状态/标签/flag 等更新必须通过受控领域 command；append-only note 不覆盖历史 note。

UI 区分：

- accepted；
- success；
- failure；
- unknown outcome。

网络失败不能自动重放非幂等高风险删除。

## 10. CSV Export

CSV 由服务端按 selected IDs 或完整 filters 生成，不依赖浏览器当前分页数据。一次导出最多 5000 行；selected IDs 最多 100 个。CSV cell 对 `= + - @` 公式前缀增加安全转义，并对双引号做标准 CSV escaping。Export 仍受 Admin AAL2、平台范围和字段允许列表控制。

不得把内部敏感字段、Storage credential、Token 或 unrestricted client context 直接导出。

## 11. 删除与隐私最小化

Batch delete 属于高风险动作，单次最多 100 条且必须属于同一平台：

- recent MFA；
- reason；
- operation ID；
- 显式确认；
- 幂等/unknown outcome 恢复。

进入 deleting 后，正文、联系邮箱、client context、labels、internal note 等个人内容立即从普通读取面消失/最小化；附件异步转 deleting。

Maintenance 使用独立 attachment cleanup claim/fence/remove/finish。只有最后一个附件得到 Storage 删除确认后，Feedback 才收敛为 deleted，并断开 identity/account 引用。

数据库行最小化不等于图片对象已删除。

## 12. Global Delete 与 Retention

Global Delete 和 account retention 复用同一个 Feedback privacy/delete helper，不建立第二套状态机。

删除过程仍受共享 backup barrier 约束。数据库备份不包含 Feedback 图片 bytes，因此无外部对象备份时不能声称附件可恢复。

## 13. Account 360 集成

Account 360 只聚合 Feedback 安全摘要，例如：

- 非 deleted 总量；
- new/reviewing 待处理；
- 最近提交时间。

不把完整正文/图片复制进 Account DTO；详情通过 Feedback 深链读取。

Platform Overview 的 `pending_feedback` 由数据库对当前平台 `new + reviewing` 状态做权威全量聚合，不从 Admin 当前页或有界列表推导。

## 15. 精确输入边界

- Feedback title：1–160 字符，拒绝控制字符；
- Feedback body：1–10000 字符；
- Idempotency-Key：1–128 字符；
- attachment 原始文件名：1–255 字符且拒绝控制字符；
- attachment 声明大小：1–4 MiB；
- private bucket 同时设置 4 MiB `file_size_limit` 与 JPEG/PNG/WebP `allowed_mime_types`，但运行时仍必须独立验证真实 bytes 与 magic；
- Submit 时若 `contact_allowed=true`，必须由服务端取得 3–320 字符的 Auth email snapshot；Auth identity 查询失败保持 draft 并 fail closed。

这些边界属于当前 canonical migration/runtime 事实；如果 OpenAPI 或实现改变，必须同步本文和对应 Requirement。

## 16. 验证基线

长期验证入口至少包括：`supabase/tests/t29_feedback_admin_center.sql`、`supabase/tests/t30_feedback_lifecycle.sql`、Consumer Harness Feedback 场景、Admin Feedback unit/browser coverage。历史 OPT-008 verification 只作为实施证据，不再承担当前架构事实来源。

## 14. 实现与测试入口

- schema/private domain：canonical migration；
- Account API：`supabase/functions/account-api/feedback.ts`；
- binary handler：`files.ts`；
- Maintenance：`maintenance/files.ts`；
- Admin：`apps/admin/features/feedback`；
- Consumer conformance：`tests/consumer-harness`。

必测：draft→attachment→submit、MIME/magic、大小上限、unknown write、跨租户、If-Match、服务端筛选、CSV、batch delete recent-MFA、Global Delete、Storage delete failure/retry。
