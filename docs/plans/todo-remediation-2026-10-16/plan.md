# TODO 缺口收敛实施计划（2026-10-16）

状态：Blocked（仓库实现与无 Docker 门禁已完成；当前只剩 Local Supabase 服务权限与外部环境/政策/生产授权）  
来源：`docs/plans/TODO.md` 当前未完成项审计  
执行规则：[`docs/development/development-release-workflow.md`](../../development/development-release-workflow.md)

## 目标

逐项重新核对 TODO 与当前 Spec / Architecture / OpenAPI / 源码 / 测试，只修真实仍存在的缺口。已经被当前实现覆盖或被现行 Requirement 淘汰的旧目标不恢复。

## 风险分级

- `TODO-ADM-001` PlatformSwitcher 键盘行为：R2。
- `TODO-ACC-001` Account 360 API 降级：R3，影响 Admin API/DTO/授权失败语义。
- `TODO-ADM-002` Admin 安全错误控制流：R3，影响身份/授权失败语义。
- `TODO-IAM-001` verified TOTP 删除：R3，涉及 Supabase Auth、recent MFA、会话和并发保护。
- `TODO-ADM-003` Admin Web 安全头/CSP：R2；生产强制 CSP/HSTS 仍是独立发布动作。
- 其余 VERIFY/OPS/PROVIDER/RELEASE 项按现行发布流程作为验证或环境证据，不把 Hosted/Provider 额外变成普通代码合并门槛。

## 阶段 1：产品缺口

### P0-A Account 360 局部降级

1. 保持 `private.admin_account_workbench_read` 为业务摘要唯一聚合入口。
2. Auth Admin identity lookup 失败时返回 `identity.source_state=unavailable`，业务摘要仍 200；Auth 404 与匿名化账户分别表达为缺失/不适用，不伪造 email。
3. Admin UI 明确显示 Identity 数据源不可用，不能把 `null` 当“无邮箱”。
4. 增加 Account API 回归，并同步 Spec/Architecture。

### P0-B PlatformSwitcher 键盘 Listbox

1. 为平台 option 建立稳定 id 与 active option。
2. 支持 ArrowUp/ArrowDown/Home/End；Enter/Space 选择；搜索输入与加载更多保持可用。
3. 采用 `aria-activedescendant` 或等价 roving focus，打开/搜索/追加数据后保持合法 active option。
4. 增加组件/浏览器回归。

### P0-C Admin 安全错误语义

1. 新增统一 `resourceLoadStateForError()` 分类，仅 session/MFA/admin/policy 类进入 access；5xx/availability 保持 error。
2. 替换仍按裸 `401 || 403` 分桶的 Security、Platform workspace、Audit、Platform directory。
3. MFA 页面文案改为服务端权威最长 30 分钟，并核对 Cookie/证明常量无 5 分钟漂移。
4. 增加分类器单测。

### P0-D verified TOTP 删除

1. 使用当前 Supabase `mfa.unenroll()`，只允许当前 Admin session 下已验证、归属当前用户的 TOTP factor。
2. 删除前要求 recent-MFA proof；数据库 prepare 重新检查 factor ownership、session、membership 与最低剩余 factor 数量，并通过 durable operation + partial unique index 串行化同一管理员的并发删除。
3. prepare 在 Provider 调用前使当前 session 旧 recent proof 失效；Provider 返回后必须 finalize，成功只在 factor 已不存在时写审计。未知结果保留短租约 operation，不能自动发起第二次删除。
4. 删除成功后刷新 Auth session/AAL；UI 使用明确确认，Step-up 后不自动重放。pgTAP、双连接并发、API、Next Auth 与 browser 用例均进入当前验证面。
5. 保留已知边界：Supabase 原生 endpoint 仍可能绕过应用入口，不能宣称 Provider 全局原子保护。

### P0-E Admin Web 安全头

1. 在应用层配置一致的 `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、Referrer-Policy、Permissions-Policy。
2. CSP 先使用 Report-Only，覆盖 Next 静态资源、same-origin BFF、Supabase Auth、TOTP data: QR；不启用 HSTS 或强制 CSP 生产策略。
3. 增加配置/响应头静态测试，真实候选部署头部验收仍在发布阶段记录。

## 阶段 2：本地验证与需求收口

- 定向 Admin unit / Account API Deno tests。
- 受影响 Auth/MFA 使用 Local Supabase 实际验证。
- `pnpm contracts:check`、`pnpm docs:check`、`pnpm typecheck`、`pnpm lint`；运行产物受影响时执行 Admin build/E2E。
- 只有满足 Acceptance 才把对应 Spec Delivery 升为 Implemented，并从 TODO 删除。

## 阶段 3：环境与发布准备

对 Hosted Maintenance、Afdian、备份恢复、Retention、真实 Consumer、Production migration/release 逐项审计现有脚本/Runbook。仓库缺少可执行检查时补脚本或清单；真实环境/Provider/法务政策/生产授权本身不伪造为仓库内完成。

## 当前退出状态

仓库实现、静态/单元/合同/build 门禁与外部事项 Runbook 已完成；`REQ-ACC-004`、`REQ-ADM-009` 已升级为 Implemented。`REQ-ADM-008`、`REQ-IAM-011` 的实现已落地但仍等待当前候选 Local browser/Supabase 证据；`REQ-ADM-010` 已从 Planned 收敛为 Partial，等待候选浏览器 CSP violation 回归后才能强制完整 CSP。

完整 `pnpm verify:task:0801` 已实际运行，但在 `start Local Supabase` 阶段因当前 Runner 无权启动 stopped 的 Windows `com.docker.service`、`dockerDesktopLinuxEngine` 不存在而 BLOCKED；不能把后续 DB/Auth/browser 用例伪造为 PASS。Hosted/Provider/Retention/Production 项也只剩明确目标环境、政策输入或生产授权，执行入口已经迁入 `docs/development/runbooks/`。

详细证据见 [`verification-record.md`](verification-record.md)。
