# Admin 安全管理与 MFA 整改设计

状态：In Progress

关联：[总计划](plan.md) · [专项审查](../../reviews/admin-security-mfa-review-2026-09-21.md)

## 背景与当前问题

现有 Admin 后端安全边界基本完整，但浏览器端没有统一表达登录、管理员身份、AAL、近期 MFA、真实授权拒绝和上游故障。不同页面直接按 HTTP 403 猜测原因，导致操作员看到互相矛盾的“无权限”或“需要 MFA”。同时，MFA 因子只有首次绑定路径，确认框部分信息与实际操作不一致，request ID 和数据库审计不能稳定关联。

当前 `system_admin` 为单例；项目没有实现 RBAC。本整改不把单管理员模型包装成细粒度权限系统。

## 目标与范围

目标：

- 建立服务端权威、前端统一消费的 Admin 安全状态。
- 为所有 Admin 页面统一认证和授权错误语义。
- 让 request ID、操作原因和审计结果成为可信证据。
- 补齐 TOTP 第二因子、安全删除、最后因子保护和会话刷新。
- 固化高风险操作的近期 MFA 政策。
- 让审计页面能支持实际调查。
- 在不破坏登录和 MFA 的前提下加固浏览器响应头。

非目标：

- 多管理员、RBAC、菜单权限配置。
- Passkey、短信、邮件 OTP 或新的身份供应商。
- 新日志平台、SIEM 或前端状态管理框架。
- 网页端绕过 MFA 的恢复后门。
- 未经授权的生产部署或真实管理员恢复。

## 当前架构

当前调用链为：

`Admin Browser -> same-origin Admin BFF -> Account API -> private PostgreSQL domain functions -> audit`

Supabase Auth 提供登录、session、AAL 和 factor。Admin BFF 管理浏览器 Cookie、CSRF、Origin 和允许路由；Account API 验证 JWT、Auth Session、系统管理员身份和 AAL；数据库私有函数是领域变更和审计写入入口。

主要缺口不是缺少新的安全层，而是同一事实在 BFF、前端页面、Account API 和数据库审计之间没有保持一致。

## 目标架构

### 单一安全状态来源

Account API 提供最小只读 security status：匿名返回 401，已登录非管理员返回 403 `ADMIN_REQUIRED`，管理员返回 200 和 `current_aal`、`recent_mfa_expires_at`（无当前会话有效 proof 时为 `null`）。该路由须在全局 AAL2 门槛前经过身份、session 与管理员校验；因子列表复用已有端点。Admin Shell 在业务数据加载前解析状态；页面不直接解析 JWT 推断权限。

### 单一错误分类

Admin 共享分类器按稳定错误码处理：

- `401`：登录失效或 session 撤销；
- `MFA_REQUIRED`：需要达到 AAL2；
- `RECENT_MFA_REQUIRED`：当前敏感操作需要重新验证；
- `ADMIN_REQUIRED`：当前用户不是系统管理员；
- 其他 `403`：真实策略拒绝；
- `409/429/5xx`：冲突、限流或服务故障。

页面只能提供业务上下文，不重复实现认证协议。

### 单一请求关联标识

Account API 为每次请求产生规范 request ID，不接受浏览器提交的规范 ID；BFF 将上游 ID 透传到响应和 UI，自己的诊断 ID 使用不同字段。同步审计记录同一请求 ID；异步最终事件以 operation/job ID 关联，并保留其自身请求 ID。一个请求可以对应多条审计记录。业务幂等 ID 与 request ID 保持不同职责。

### MFA 生命周期

零个 verified factor 的 `system_admin` 仅能走受限的首因子注册；已有 verified factor 时，新增或删除因子都需要现有因子的近期验证。可配置备用 TOTP factor，显示名称复用 Supabase `friendlyName`。应用的 UI/BFF 拒绝删除最后一个 verified factor；本地固定版本实测原生 unenroll 和双会话竞争均可删至零，故删除入口不能凭应用检查宣称全局保护，发布须单独决策。因子变化后刷新会话并撤销旧 recent-proof；本地实测 refresh 前 AAL2 仍可见，refresh 后降为 AAL1。离线恢复沿用运维流程，不在网页提供绕过入口。

### 可调查审计

审计区分 accepted、completed、failed，提供经过允许列表的 actor、target、reason code、change summary、request ID。自由文本原因不能保证不含密钥，优先采用允许列表 `reason_code`；确需备注时限长、校验并限制投影，不承诺自动脱敏。应用处理的 MFA 因子变化、Step-up、session 撤销和管理员恢复进入安全事件；Supabase Auth 原生日志是独立来源，先探测是否启用、可访问和保留策略，未具备时明确记录覆盖缺口。

## 接口、数据与配置

预期受影响范围：

- Admin OpenAPI：security status、错误码、Step-up 标记和必要审计字段。
- Admin BFF：状态路由、request ID 透传、Cookie/session 行为。
- Account API：status、Factor ID 校验、recent-proof、原因和审计上下文。
- PostgreSQL：兼容迁移、审计投影、recent-proof 失效与到期清理、安全事件；不为已有 Auth 显示名新增表。
- Admin UI：Shell Gate、共享错误分类、Security/MFA/Audit 页面和确认框。
- 部署配置：Admin 响应安全头和 CSP。

兼容顺序遵循：兼容 schema/过程扩展 -> API 兼容版本 -> BFF/UI -> 验证 -> 后续单独收缩旧结构。已应用迁移不得修改，使用新迁移 forward-fix。

## 跨阶段不变量

1. 单例管理员仍由服务端数据库事实决定。
2. 任何客户端显示都不能扩大服务端权限。
3. recent-proof 必须绑定当前管理员与有效 session，并由服务端检查过期。
4. Factor ID 未经服务端验证不得进入可信审计。
5. Step-up 完成不会自动执行原敏感操作。
6. 本项目 UI/BFF 不允许在线删除最后一个 verified factor；Supabase 原生端点的绕行和并发边界必须实测并如实记录，不能将应用检查表述为全局原子保证。
7. 操作原因要么不收集，要么以服务端校验的允许列表代码进入审计；自由文本只在确有需求时限长并限制展示。
8. 202 只表示 accepted，不表示 completed。
9. request ID 不替代 operation/idempotency ID。
10. UI、API 和审计不得泄露 Token、MFA Secret、Cookie 或恢复材料。

## 风险与取舍

- 状态端点会增加一次只读请求；换取所有页面一致的安全状态，避免多次失败请求和错误推断。
- 第二因子降低锁死风险；Auth 原生删除、并发和 session 降级需先在固定版本本地 Supabase 探测，再确定可交付边界。
- 点击劫持先由实际生效的 `X-Frame-Options: DENY` 或强制 `frame-ancestors 'none'` 阻断；完整 CSP 先 Report-Only 验证兼容性。没有报告接收端时不承诺生产报告观察。
- 审计增加字段会带来兼容迁移；采用允许列表投影，避免把完整请求体写入审计。
- 不引入 RBAC；只有出现多管理员的明确业务需求时才另立设计。

## 验收条件

- 六种安全状态在所有 Admin 页面具有一致行为。
- 普通用户、AAL1、AAL2、过期 proof、撤销 session 和服务故障均有实际测试。
- response request ID 可关联本次请求的审计记录；异步最终结果通过 operation/job ID 关联。
- 所有 UI 必填原因代码可从允许列表审计投影读取。
- 第二因子可用，本项目在线删除最后因子被拒绝；原生 API 绕行边界有实测记录。
- 高风险路由的 OpenAPI Step-up 标记与实际服务端校验一致。
- Admin 审计可区分 accepted/completed/failed。
- 响应安全头不破坏登录、MFA 二维码和 Admin API。

## 待确认项

`SEC-PROBE-00` 已证实 Auth 原生删除竞争可删至零、AAL 在 refresh 后降级、Auth audit 表可读。最后因子全局保护未满足，删除入口保留发布阻塞；第二因子添加及其他独立改进可继续，不能静默宣称原子保护。以下能力明确推迟，不应由实施 Agent 自行加入：

- 多管理员和 RBAC；
- “注销所有设备”的产品入口；
- 恢复码、Passkey 或其他 MFA 类型；
- 生产强制 CSP 启用时间；
- 真实管理员离线恢复演练。
