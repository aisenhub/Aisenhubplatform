# OPT-009 单平台账户工作台与账户治理

状态：In Progress

关联：[总计划](plan.md) · [优化事项总清单](../optimization-intake/README.md) · [预研架构](../optimization-intake/platform-account-workbench-architecture.md)

## 背景与最新事实基线

正式实施基线为 `main@e5376b6a4c626a9c55e86d64633491c20fdfde19`；该基线已通过 GitHub Actions 的完整 `TASK-0801`。

重新核对最新源码后，预研核心问题仍成立，但 OPT-007/008 已改变可复用事实：

- `/admin/platforms/:platformId/accounts` 仍请求 `accounts?q=...&limit=100`，前端一次性持有结果，没有 cursor。
- `private.admin_account_list_v2` 只返回 Account/User ID、状态和生命周期时间，搜索只匹配 Account ID、User ID、status。
- 当前列表/Inspector 不读取 `platform_profiles`、当前 Subscription/Plan、Config、Feedback 或 Billing 摘要。
- UI 对 suspend/restore/close 要求 `reason`，但 API 调用的 `private.admin_account_transition(ctx, platform, account, action)` 没有 reason 参数，Audit metadata 为空；理由不是权威事实。
- 账户动作已经统一经过 `adminStepUp`（AAL2 + recent-MFA）；本项保持该边界。
- OPT-007/008 已提供 Config 与 Feedback 权威数据，可直接进入 Account 360 摘要。
- `platform_profiles` 是用户可编辑资料，Admin 标签/备注必须使用独立 Admin-only 领域。
- Supabase Auth email/`last_sign_in_at` 属于 Global Identity；平台页可按需只读 email，但不得把 Auth `last_sign_in_at` 冒充平台活跃。

本项涉及 security-definer SQL、Admin-only 数据、OpenAPI、Admin API、高风险治理、Global Delete/retention 隐私链和真实浏览器工作台，风险分级 **R3**。

## 目标

1. 平台账户列表改为服务端稳定 cursor 分页，展示 Profile、状态、当前有效 Plan/Subscription、加入时间与 Admin 标签。
2. 新增 `/admin/platforms/:platformId/accounts/:accountId` Account 360，集中展示平台资料、权益、订单摘要、Config、Feedback、标签/备注、治理历史和受控动作。
3. Global Identity 与 Platform Account 严格分层：email 只读，密码/MFA/全局删除仍由 `/admin/accounts/:userId` 治理。
4. suspend/restore/close 的 reason 写入权威治理事件；保留 recent-MFA、显式确认和 unknown-outcome 不自动重放。
5. 新增 Admin-only tags/notes，与用户 Profile 分离。
6. Config/Feedback/Billing 只做权威摘要和深链，不复制领域状态机。
7. 首版不展示“平台最近活跃”，直到存在真实平台 activity/telemetry 事实。

## 非目标

- 不修改 Global Identity email/password/MFA/session/global deletion。
- 不新增 impersonation、批量封禁、批量关闭。
- 不把 Auth `last_sign_in_at` 作为平台活跃。
- 不重构 Product/Offer/Price、退款或 recurring provider；这些属于 OPT-010。
- 不把 Config/Feedback 私有正文/附件大量复制进账户 DTO。
- 不把 Billing `show_amount` 或未最终验证订单当收入。

## 数据模型

### Admin Tags

`public.platform_account_admin_tags(platform_id, platform_account_id, tag, created_by, created_at)`，主键 `(platform_id, platform_account_id, tag)`；每账户最多 20 个，tag 1–32 字符。Admin-only、强制 RLS。

### Admin Notes

`public.platform_account_admin_notes(id, platform_id, platform_account_id, body, created_by, created_at, redacted_at)`；append-only，body 1–2000 字符。Audit 不复制正文。

### Governance Events

`public.platform_account_governance_events(id, platform_id, platform_account_id, action, reason, actor_admin_user_id, created_at)`；reason 1–2000 字符，与账户状态 mutation 同事务写入。通用 Audit 仅关联 event id，不复制完整 reason。

三个表都只允许 `domain_owner` 直接访问；Admin 通过固定 search_path 的 security-definer 函数访问。

## 列表查询

新增兼容 `private.admin_account_list_v3(ctx, platform_id, cursor_account_id, limit, q, status, plan_id, subscription_status, tag, joined_from, joined_to)`，不修改 v2。

稳定顺序 `(created_at desc, id desc)`，cursor 必须属于同一 platform。一级投影：Account/User ID、status、display_name/avatar_url、Plan id/name/kind、subscription status/current_period_end、tags、created/updated。

搜索/筛选必须在 SQL 分页前执行，匹配 Account ID、User ID、display name、status、Plan name/code。Auth email 不进入 SQL 搜索，避免扩大数据库 Auth PII 权限。

## Account 360 读取

新增 `private.admin_account_workbench_read(ctx, platform_id, account_id)`，返回不含 Auth PII 的安全聚合：

- Account/Profile：状态与生命周期时间、display_name/avatar/bio/locale/timezone。
- Entitlement：当前 subscription projection、Plan 与 period。
- Billing：订单总数、需关注数量、最近订单的安全状态摘要；不计算 revenue。
- Config：active personal Config、published Gallery、pending review、最近更新时间。
- Feedback：非 deleted 总量、new/reviewing 待处理量、最近提交时间。
- Admin support：tags、最近 notes、最近 governance events。

Account API 再通过现有 Auth Admin exact read 补 `identity.user_id/email`。Auth 服务不可用时 fail closed；不得从历史 Feedback email snapshot 反推当前 Global Identity email。

## Admin-only 命令

新增：

```text
private.admin_account_tags_replace(ctx, platform_id, account_id, tags[])
private.admin_account_note_add(ctx, platform_id, account_id, body)
```

均验证 system admin、活动 session 与 platform/account 归属。tags 为整集合替换；note append-only。Audit 不记录 note body。

## 账户状态治理

新增兼容 `private.admin_account_transition_v2(ctx, platform_id, account_id, action, reason)`，复用原状态机：active→suspended、suspended→active、active|suspended→closed。

v2 必须：校验 reason、锁定目标行、执行状态更新、同事务写 governance event、写 Audit event（只含 governance event id）。旧 transition 保留兼容；新 Admin API/UI 切到 v2。API 继续先执行 `adminStepUp`。

## 隐私与 Global Delete

Admin note/reason 可能含个人信息。新增统一 privacy helper；Global Delete/retention 最小化 Platform Account 时：note body redaction、governance reason redaction、tags 删除。普通 platform account close 不自动擦除支持历史，因为 close 不等于 Global Identity privacy delete。

## Admin API

- `GET /admin/api/v1/platforms/{platformId}/accounts`：增加 `cursor/limit/q/status/plan_id/subscription_status/tag/joined_from/joined_to` 与 `next_cursor`。
- `GET /admin/api/v1/platforms/{platformId}/accounts/{accountId}`：Account 360 + 只读 Global Identity 摘要。
- `PUT /admin/api/v1/platforms/{platformId}/accounts/{accountId}/tags`。
- `POST /admin/api/v1/platforms/{platformId}/accounts/{accountId}/notes`。
- 现有 suspend/restore/close 路径不变，body `reason` 由 API 读取并传给 transition v2，继续要求 `adminStepUp`。

OpenAPI 只做 additive 扩展，`contracts:breaking` 必须 PASS。

## Admin UI

列表：搜索 + status + Plan + subscription status + tag + joined date；表格展示用户（avatar/display name/ID fallback）、状态、当前方案、标签、加入时间；cursor 分页；不展示虚假的平台最近活跃。

详情分区：概览、平台资料、订阅与权益、订单摘要、配置资源、用户反馈、管理员标签与备注、账户治理时间线。Global Identity 区只显示 email/user id + “打开统一用户”深链。

治理动作继续使用 `ConfirmActionDialog` + recent-MFA，reason 必填，成功后进入治理时间线。close 不可逆。

## 安全与恢复

- 新函数均 `security definer` + `search_path = pg_catalog, private, public`，只 grant `admin_executor`。
- Admin-only 表不对 browser/account/job executor 直接开放。
- 跨平台 account/cursor/tag/note 全部拒绝 IDOR。
- tags/notes/status mutation 的 unknown outcome 不自动重放，刷新权威详情判断结果。
- notes/reason 不复制到通用 Audit metadata。

## 兼容与回退

保留 `admin_account_list_v2` 和旧 `admin_account_transition`。新 v3 read/v2 transition 均 additive。UI/API 可回退而不 destructive rollback；数据库问题使用 forward-fix migration。

## 验收条件

1. 列表不再固定 `limit=100`，服务端 stable cursor + 结构化筛选。
2. 列表展示 Profile + 权威 Plan/Subscription，不冒充 Auth 登录时间为平台活跃。
3. Account 360 展示 Profile、Entitlement、Billing、Config、Feedback、tags/notes、治理时间线与 Global Identity 深链。
4. suspend/restore/close reason 成为同事务权威事件，API 不再丢弃 reason。
5. tags/notes 与用户 Profile 分离；note body 不进入 Audit metadata。
6. Global Delete/retention redaction notes/reasons 并清理 tags；普通 close 不冒充隐私删除。
7. IDOR、权限、recent-MFA、unknown-outcome、并发、stable cursor 回归通过。
8. fresh + non-empty upgrade、DB/API/contracts、Admin unit/typecheck/build、真实 Browser、docs/lint/format、canonical R3 全绿。
9. 已授权 staging 的 migration/Edge 同步并验证；Production 未授权则 NOT_RUN。
10. GitHub task branch、main 与分支清理闭环后才开始 OPT-010。

## 待确认项

无阻塞性产品决策。首版明确不展示平台最近活跃，未来存在真实 activity/telemetry contract 后再 additive 扩展。
