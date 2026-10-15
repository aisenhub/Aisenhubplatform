# 平台与租户需求

## REQ-PLT-001 — Platform 是业务租户第一作用域

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security
- **Architecture**: `architecture/modules/platform-tenancy.md`

**Statement**

绝大多数业务资源必须明确归属 Platform；关键数据库关系必须阻止跨平台拼接，平台作用域不得由浏览器覆盖。

## REQ-PLT-002 — Platform Key 只用于服务端平台身份

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Platform Key 必须只证明调用服务所属平台，不能替代用户 JWT；Key 明文不得持久化到数据库或下发浏览器。

## REQ-PLT-003 — Platform Key 生命周期必须可撤销、可轮换

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Platform Key 必须支持一次性明文交付、部署确认、撤销和 HMAC key 轮换；撤销后后续授权必须实时拒绝。

## REQ-PLT-004 — Origin 与 Auth 回调必须按环境精确登记

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

平台必须按 local/preview/staging/production 登记精确 Origin、OAuth callback、password reset 与 email confirmation URL；生产不能依赖宽泛 preview wildcard 作为正式安全边界。

## REQ-PLT-005 — 账户激活策略与平台/Auth/权益状态分离

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Functional

**Statement**

`allow_activation` 只控制已认证用户首次创建 Platform Account，不等价于全局 signup、Platform active、账户 active 或付费 Entitlement。

## REQ-PLT-006 — Principal 由平台身份与用户身份共同构造

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

用户业务 Principal 必须由有效 Platform Key、已验证 Global JWT、Platform/Identity/Account 当前状态共同决定；读取 Principal 不得隐式激活账户。

## REQ-PLT-007 — Admin Platform scope 以 URL 为权威

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: UX

**Statement**

Admin 的单平台工作区必须以 URL `platformId` 表达当前上下文；切换平台时不得把旧平台实体 ID 或迟到响应带入新作用域。

## REQ-PLT-008 — 中央 readiness 不得冒充 Consumer 已完成接入

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Constraint

**Statement**

中央系统只能声明可由中央证明的 Platform active、Origin、Key 和部署确认 readiness；Consumer Auth/BFF/build/E2E/业务 capability 是否真正完成必须由目标平台证据验证。

**Acceptance**

- 中央 readiness 只由 Platform active/activation policy、完整 active Origin、active Key、Key deployment confirmation 四类事实组成。
- Commerce 配置属于按需能力，不作为免费/未启用付费平台的 readiness blocker。
- 外部 Consumer Auth/BFF/build/E2E 不提供手工“已完成”勾选替代真实证据。

## Domain Verification

当前实现证据包括 canonical Platform/Origin/Key SQL、Account/Admin runtime、`platform-integration/`、跨平台/Key 隔离测试与 Admin scope/navigation tests。Requirement 的 Hosted/Production 接入结论仍必须由目标 Consumer 自身证据证明。
