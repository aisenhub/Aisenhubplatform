# 账户与资料需求

## REQ-ACC-001 — Global Identity 与 Platform Account 分层

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security
- **Architecture**: `architecture/modules/accounts-profile.md`

**Statement**

系统必须把共享 Auth Identity 与各平台 Platform Account 作为不同领域对象；平台账户状态、Profile、Preferences 和权益不得被解释为全局身份属性。

**Acceptance**

- 一个 Identity 可关联多个 Platform Account。
- 单平台管理员界面不会泄露其他平台业务数据。
- 密码/MFA/全局删除归 Identity 管理，不复制到 Platform Account mutation。

## REQ-ACC-002 — Platform Account 生命周期受控

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Functional

**Statement**

Platform Account 必须支持 `active / suspended / closed` 权威状态；closed 为终态，suspend 不修改既有有限期权益的时间轴。

**Acceptance**

- 合法 transition 由服务端/数据库验证。
- 无效或 no-op transition 不生成伪治理事件。
- 恢复账户不会自动补偿暂停期间流逝的 Grant 时间。

## REQ-ACC-003 — Profile/Preferences 并发更新不得静默覆盖

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Reliability

**Statement**

Profile 与 Preferences 的可变资料必须使用版本/前置条件避免并发静默覆盖，且客户端不能修改资源归属和账户状态字段。

**Acceptance**

- 缺少前置条件返回明确错误。
- 版本冲突返回冲突/前置条件失败而不是 last-write-wins。

## REQ-ACC-004 — Account 360 提供平台账户统一上下文

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Functional

**Statement**

单平台 Account 360 必须聚合账户状态、Profile、权益、Billing 安全摘要、Config、Feedback、管理员标签/备注和治理时间线，并保持各领域写入仍由各自权威模块负责。

**Acceptance**

- Account 360 不建立第二套 Billing/Entitlement/Config/Feedback 状态机。
- 详细对象可下钻到相应领域工作区。
- 聚合读取的局部失败显示 unavailable，而不是伪造 0/null。

**Current implementation**

领域摘要由 `private.admin_account_workbench_read` 服务端聚合，Identity email 继续通过独立 Auth Admin 边界补充。该 Identity 数据源现在通过 `identity.source_state = available | missing | unavailable | not_applicable` 独立表达：Auth lookup 暂时失败时 Workbench 仍返回账户状态、权益、Billing、Config、Feedback、tags/notes 和治理时间线，Identity 部分明确 `unavailable`，不再用整体 `503` 或伪造 `null` 隐藏局部失败。

## REQ-ACC-005 — 平台活跃语义不得伪造

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Functional

**Statement**

Global Auth `last_sign_in_at`、Platform login 与 Platform activity 必须保持不同语义；没有可信平台行为事实时不得把全局登录时间标成平台最近活跃。

## REQ-ACC-006 — 管理员治理原因必须持久化

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

管理员 suspend/restore/close 的 reason 必须进入权威治理记录，并与 actor、before/after status、operation identity 和时间关联；不能只在确认框收集后丢弃。

## REQ-ACC-007 — Admin-only 支持上下文与用户资料隔离

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Privacy

**Statement**

Admin tags/notes 必须与用户可编辑 Profile 分离，Consumer API 不得读取或修改；Audit 不复制完整 note 正文。

## REQ-ACC-008 — Global Delete 保持引用完整性

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Privacy

**Statement**

删除 Global Identity 时必须阻止业务复活、清理/匿名化个人数据并最终移除 Auth user，同时保留 Order/Grant/Audit 等所需最小引用事实。

## 非目标 / 未接受项

- 定时自动解除 Platform suspend 尚不是当前正式需求。
- 管理员无痕 impersonation / Support Session 尚未成为当前需求。
- 高风险批量暂停/关闭尚未成为当前需求。

## Domain Verification

当前基线证据包括 canonical Platform Account/Profile/Preferences/Admin support SQL、Account/Admin runtime 与 OpenAPI、`t14_account_lifecycle.sql`、`t31_account_workbench_domain.sql` 及 Admin Account Workbench tests。`REQ-ACC-004` 的 Auth Identity 局部降级缺口已经由当前 handler 反查确认，因此不能用其余 Account 领域测试把该 Requirement 升级为 Implemented。
