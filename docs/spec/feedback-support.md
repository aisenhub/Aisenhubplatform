# Feedback 与支持需求

## REQ-FBK-001 — Feedback 是独立业务领域

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Functional
- **Architecture**: `architecture/modules/feedback-support.md`

**Statement**

Feedback 的正文、联系快照、附件、状态、标签、内部备注和删除流程必须使用独立领域模型，不复用 Config file 表、bucket 或配额语义。

## REQ-FBK-002 — 用户 Feedback 必须先 Draft 再 Submit

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Functional

**Statement**

Consumer 只有 draft 状态可修改正文/附件；Submit 必须原子确认必要字段，且不存在仍在上传/删除等非终态附件。保留参与提交的附件必须 active/confirmed；已取消、失败或过期的终态附件不再阻塞 Submit。

**Acceptance**

- 非 draft Feedback 不能再修改正文或新增附件。
- pending/receiving/storing/deleting 等非终态附件存在时 Submit 拒绝。
- 成功 Submit 原子进入 `new` 并记录提交时间与作者/联系快照。

## REQ-FBK-003 — 身份与联系邮箱由服务端快照

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Privacy

**Statement**

Feedback platform/account/user 必须来自 Principal，联系邮箱只能由服务端从当前 Auth identity 取得并在提交时快照；该快照不得被解释为当前全局邮箱。

## REQ-FBK-004 — Client Context 必须允许列表化

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Privacy

**Statement**

Feedback client context 只能接受有界允许字段，不得收集完整请求 headers、Token、任意 URL query 或无界 metadata。

## REQ-FBK-005 — 图片附件必须有独立私有 Storage 边界

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Feedback 图片必须使用独立 private bucket、真实 byte/magic 校验、数量/大小/MIME 限制和 write-outcome ledger；浏览器不能直接持有 Storage credential。

## REQ-FBK-006 — Admin Feedback Center 必须服务端筛选与分页

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Functional

**Statement**

Admin 的查询、组合筛选、CSV 导出和 batch operation 必须基于服务端全量条件，而不是只过滤当前浏览器页。

## REQ-FBK-007 — 内部备注与通用 Audit 分离

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Privacy

**Statement**

Internal note 可作为受保护 Feedback event 保存，但通用 Audit metadata 不得复制完整 note 正文或附件内容。

## REQ-FBK-008 — 删除必须同时最小化文本和清理附件

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Privacy

**Statement**

Feedback 删除进入 deleting 后必须从普通读取面移除/最小化个人内容，并异步删除附件；只有最后一个对象删除确认后才完成 deleted 和身份引用断开。

## REQ-FBK-009 — Account 360 只消费安全摘要

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Privacy

**Statement**

Account 360 只聚合 Feedback 计数、待处理量和最近时间等安全摘要，不复制完整正文、图片或内部备注。

## Domain Verification

当前 `Delivery=Implemented` 的基线证据至少包括 canonical migration 中的 Feedback/Attachment/Event/Admin domain functions、`supabase/functions/account-api/feedback.ts`、`supabase/functions/maintenance/files.ts`、`supabase/tests/t29_feedback_admin_center.sql` 与 `supabase/tests/t30_feedback_lifecycle.sql`，以及 canonical Account/Admin contract。后续任何 Requirement 若用于正式关闭计划，还应在对应 Plan/Review 中链接实际运行的测试结果，而不是仅引用本段。
