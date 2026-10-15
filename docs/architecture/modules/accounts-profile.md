# 账户与资料架构

本模块描述 Global Identity 与 Platform Account 的分层、账户生命周期、Profile/Preferences、Admin Account 360 以及平台账户治理数据。

## Requirements

本模块主要承担 [账户与资料需求](../../spec/accounts-profile.md) `REQ-ACC-001` ～ `REQ-ACC-008`，并共同满足 `REQ-SYS-001`、`REQ-SYS-004`、`REQ-SYS-006`、`REQ-SYS-008`、`REQ-SYS-009`。

## 1. 核心模型

Aisenhubplatform 明确区分：

```text
Supabase Auth User = Global Identity
              │
              ├── Platform A -> platform_account A
              └── Platform B -> platform_account B
```

Global Identity 保存认证身份；Platform Account 保存用户与某个平台的业务关系。不能把 Auth 用户状态直接当作某个平台账户状态，也不能把平台账户的 Profile 当作全局身份资料。

## 2. `public.platform_accounts`

关键字段：

- `id`；
- `platform_id`；
- `user_id`，受控匿名化完成后可为 NULL；
- `status: active | suspended | closed`；
- `activated_at / suspended_at / closed_at / anonymized_at`；
- `last_login_at`；
- `created_at / updated_at`。

约束要求：正常账户 `user_id != NULL && anonymized_at IS NULL`；只有受控匿名化后的 closed 墓碑允许 `user_id=NULL`。

### 生命周期语义

- `active`：允许普通业务，仍需进一步检查 entitlement/feature；
- `suspended`：保留数据和时钟，不允许普通业务；
- `closed`：平台关系关闭，不自动重开；
- Global Delete 最终可将 closed 账户匿名化为墓碑。

Suspend 不冻结已有有限期 Grant 的时间；恢复账户不会自动补时。

## 3. Profile 与 Preferences

### `public.platform_profiles`

每个平台账户一份业务资料：

- display name；
- avatar URL；
- bio；
- locale；
- timezone；
- metadata JSON object；
- `row_version`。

### `public.platform_preferences`

保存有界 JSON object 与 `row_version`。

HTTP 更新使用 ETag / `If-Match` 乐观并发：

- 缺少前置条件 -> 428 `PRECONDITION_REQUIRED`；
- 版本不匹配 -> 412 `PRECONDITION_FAILED`；
- 不允许静默覆盖并发更新。

Profile PATCH 只能修改允许列表字段，不接受 `user_id/platform_id/account_id/status` 等归属字段。

## 4. Consumer Account API

主要能力：

- `GET /v1/account/principal`；
- `POST /v1/account/activate`；
- `POST /v1/account/close`；
- `GET/PATCH /v1/profile`；
- `GET/PATCH /v1/preferences`；
- `POST /v1/identity/delete-request`。

所有 handler 从已验证 Principal 取得 user/platform/account，不信任浏览器在 body 中声明归属。

账户关闭与 Global Delete 请求属于敏感动作，需要普通用户 recent authentication；这与 Admin recent MFA 是两套独立证明体系。

## 5. Global Identity Admin 工作区

`/admin/accounts` 的主对象是 Supabase Auth Identity，而不是 Platform Account。中央 API 通过 server-only Auth Admin 能力读取允许的 Auth 摘要，再使用私有查询补充跨平台账户关系。

Identity 详情负责：

- Auth 身份摘要；
- 跨平台账户列表；
- 当前 identity lifecycle；
- 当前/最近 deletion request；
- 关联 deletion job；
- Global Delete 审批/重试入口。

密码、MFA、全局会话和全局删除不应复制到单个平台账户工作区。

## 6. Platform Account 360

平台账户工作区聚合当前平台上下文：

- Account status/lifecycle；
- Profile；
- 当前 Entitlement / Plan；
- Billing 安全摘要；
- Config 摘要；
- Feedback 摘要；
- Admin tags/notes；
- governance timeline。

Auth email 只作为必要的全局身份摘要只读展示；Auth `last_sign_in_at` 不能被命名为“平台最近活跃”。没有当前平台行为 telemetry 时，不制造该指标。

### 服务端聚合边界

当前详情不是由浏览器分别请求 Account/Profile/Subscription/Billing/Config/Feedback 后自行 Join。`private.admin_account_workbench_read` 在一个平台作用域内返回：

- 账户生命周期与 Profile；
- 当前 Plan/Subscription；
- Billing order 总量、需要关注的订单数和最新订单安全摘要；
- active Config、Gallery 已发布 Config、待审核 submission 数量和最近 Config 更新时间；
- 已提交 Feedback 总量、new/reviewing 数量和最近提交时间；
- Admin tags；
- 最近最多 20 条 Admin notes；
- 最近最多 50 条账户 governance events。

Account API 随后按 `user_id` 通过 server-only Auth Admin 边界补充 Identity email。浏览器因此消费一个服务端 Workbench DTO，而不是成为跨领域聚合器。

当前这里还有一个明确边界：Auth Admin lookup 网络/服务异常会使详情整体返回 `503 AUTHORIZATION_UNAVAILABLE`；尚未实现“业务摘要正常、Identity email 单独 unavailable”的局部降级。因此 [REQ-ACC-004](../../spec/accounts-profile.md) 当前为 Partial，不能把旧预研中的细粒度降级描述成已经实现。

### 时间线语义

当前 Workbench 自身持久/聚合的时间线只包含账户治理 `governance_events`。Billing、Config、Feedback 在 Account 360 中是摘要和深链，不会复制成一张新的跨域 Event Store。若未来需要统一跨域时间线，应保留 source domain/object/time 并下钻到各领域事实；当前架构不能宣称已经存在完整跨域 timeline。

## 7. Admin-only 支持数据

### `platform_account_admin_tags`

- Platform/Account 复合归属；
- tag 1–32 字符；
- 与用户可编辑 Profile 分离。

### `platform_account_admin_notes`

- append-only support note；
- body 1–2000 字符；
- 可在隐私清除中 redacted；
- Audit 不复制 note 正文。

### `platform_account_governance_events`

权威记录平台账户治理：

- action: `suspend | restore | close`；
- reason；
- actor admin；
- before/after status；
- operation ID；
- created time。

UI 收集的治理 reason 必须真正进入此领域事实，不能只存在浏览器确认框。

## 8. Admin 账户状态变更

Suspend/restore/close：

- 要求 active System Admin + AAL2；
- 属于 recent-MFA 高风险动作；
- 要求显式 target、impact、reason 和确认；
- mutation 不因 401 refresh 或网络超时自动重放；
- unknown outcome 时先读取当前权威状态；
- 数据库函数在事务内重新校验账户平台归属和合法 transition。

无效/no-op transition 不应生成伪 governance fact。

## 9. 隐私与删除

Global Delete 期间：

1. `identity_lifecycle` 先进入 deleting，阻止新账户/Grant/上传等；
2. 关闭并清理所有平台账户；
3. Profile/Preferences 和用户文本按 retention 规则清除或匿名化；
4. tags/notes/Feedback/Config 等各领域调用自己的 privacy helper；
5. `platform_accounts.user_id` 最终置 NULL，保留必要 closed 墓碑；
6. Auth user 最后删除。

不能为了删除身份破坏 Grant、Order、Audit 等必须长期保持引用完整性的业务事实。

## 10. 查询与分页

Platform Account 列表使用 `private.admin_account_list_v3` 做服务端稳定 cursor/filter，不通过浏览器加载前 100 条后再假装全量筛选。当前结构化条件为：

- `q`：Account ID、User ID、account status、display name、Plan name/code；
- `status: active | suspended | closed`；
- `plan_id`；
- `subscription_status: active | suspended | none`；
- Admin `tag`；
- `joined_from / joined_to`；
- `limit` 1–100。

排序固定为 `(created_at DESC, id DESC)`。HTTP cursor 携带上一页末尾 Platform Account ID，数据库在同一平台内解析其 `created_at` 并继续复合 keyset pagination；不存在/跨平台 cursor 按资源不存在拒绝。

列表 DTO 与详情 Workbench DTO 有意分离：列表只返回高频识别/筛选字段与当前 Plan/Subscription 摘要，不为每行聚合 Billing/Config/Feedback 历史。

所有跨平台资源访问失败统一避免泄露对象存在性。

## 11. 实现与测试入口

- schema/domain：canonical migration 中 account/profile/preferences/admin support 函数；
- Account API：`supabase/functions/account-api/account.ts`；
- Admin API：`supabase/functions/account-api/admin.ts`；
- UI：`apps/admin/features/accounts`；
- Identity/security：`modules/identity-security.md`；
- Global Delete：`modules/audit-lifecycle-operations.md`。

必测：首次激活、激活关闭、suspend/restore/close、并发 transition、If-Match、跨平台 404、Account 360 聚合失败、Auth 服务不可用 fail closed、Global Delete 并发激活、匿名化后 FK 完整性。
