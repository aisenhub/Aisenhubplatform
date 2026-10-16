# 当前剩余工作 TODO

更新时间：2026-10-16  
基线说明：本清单在 `main == origin/main == b1613e01995dce404494cb1e88ed4e380d01c09c` 的状态对账后建立。执行任何条目前仍须重新核对当前 HEAD、Spec、Architecture、OpenAPI、源码和测试，不能永久沿用本日期的代码判断。

本文件是 `docs/plans` 中当前**未完成工作的一览表**。旧 Billing、Admin MFA 和文档收敛过程计划在稳定事实进入 Spec/Architecture 后删除，由 Git 历史保留实施过程；这里不复制已经完成或已被后续架构淘汰的旧 TASK。

判断规则：

- 产品代码是否仍有缺口，以 Active Requirement 的 `Delivery: Partial/Planned` 和当前源码为准。
- Hosted / Provider / Staging / Production 是否完成，只能由对应环境证据证明；本地 PASS、migration 或 schedule 存在不能替代。
- 已删除的 Consumer runtime SDK、`template-preview` 产品面和历史 Admin Consumer Lab 不属于当前目标，不得因为旧计划仍曾列任务而重新引入。
- 生产部署、真实付款、真实管理员恢复、Secret/费用变更和破坏性恢复仍需单独明确授权。

## P0 — 当前产品实现缺口

### TODO-ACC-001 — Account 360 支持局部数据源降级

- **Requirement**：`REQ-ACC-004`（Partial）
- **当前事实**：`private.admin_account_workbench_read` 已能一次返回账户业务摘要；Account API 另外通过 Auth Admin 查询 Identity email。当前 Auth Admin lookup 异常时，整个详情返回 `503 AUTHORIZATION_UNAVAILABLE`。
- **要做**：把 Auth Identity 摘要视为可独立失败的数据源。业务 Workbench 已成功时，Identity email 查询失败应返回明确 `unavailable`/source error，而不是让账户状态、权益、Billing、Config、Feedback、tags/notes 等全部不可见。
- **边界**：不能把浏览器变成跨领域聚合器；不能用 `null` 或空字符串伪装 Auth 查询成功；不能缓存过期 Identity 资料冒充当前事实。
- **主要改动面**：Account/Admin API DTO 与 handler、canonical Admin OpenAPI、Admin Account 360 UI/状态组件、单元/API/E2E。
- **完成条件**：Auth lookup 正常时行为不退化；Auth lookup 故障时业务摘要仍可用且 Identity 字段明确 unavailable；跨平台/权限边界保持；contracts/API/Admin 浏览器回归 PASS。

### TODO-ADM-001 — PlatformSwitcher 完整键盘 Listbox 行为

- **Requirement**：`REQ-ADM-008`（Partial）
- **当前事实**：已有 dialog/listbox/option/`aria-selected`、Tab、Escape、click-outside；缺 ArrowUp/ArrowDown/Home/End 和明确 active-option focus 管理。
- **要做**：实现符合当前组件结构的 roving focus 或 `aria-activedescendant`，补方向键/Home/End、焦点进入/退出、加载更多与当前选中项的键盘语义。
- **边界**：不能破坏现有搜索输入、鼠标操作、250ms debounce、cursor pagination、stale-response guard 和窄屏 Sheet。
- **主要改动面**：`apps/admin` PlatformSwitcher、相关 UI/导航测试与浏览器 a11y 回归。
- **完成条件**：仅键盘即可搜索、遍历、选择平台并返回 Global；读屏状态明确；桌面/窄屏/鼠标行为不回退。

### TODO-ADM-002 — 收敛所有 Admin 安全错误控制流

- **Requirement**：`REQ-ADM-009`（Partial）
- **当前事实**：Admin Shell 与共享机器码分类器已存在，AuthSessionManager 能识别 `MFA_REQUIRED`、`RECENT_MFA_REQUIRED`、`ADMIN_REQUIRED`；部分页面仍先按 HTTP 401/403 合并为 `access` load-state，再决定 UI。
- **要做**：逐个清点关键 Global/Platform workspace 的 load/mutation 错误分支，统一由稳定机器码决定登录失效、完整 MFA、recent step-up、非管理员、真实 forbidden、限流、冲突和上游故障；去掉页面自行猜 403 的分支。
- **同时修正**：`apps/admin/app/admin/mfa/page.tsx` 当前仍展示“服务端绑定 5 分钟”文案，而权威 recent-MFA proof 最长为 **30 分钟**；修改文案时必须与服务端/合同回归一起验证，不能只改字符串。
- **边界**：Step-up 成功后不得自动重放高风险 mutation；5xx/authorization unavailable 不得触发假退出或显示“无权限”。
- **主要改动面**：Admin resource/load-state helpers、各关键 feature 页面、MFA 页面、单元与浏览器身份矩阵。
- **完成条件**：关键工作区不再按裸 401/403 自行推断业务安全状态；六类身份/故障场景行为一致；旧 5 分钟文案不存在；Admin unit + Local browser matrix PASS。

### TODO-IAM-001 — 完成 verified TOTP 删除生命周期

- **Requirement**：`REQ-IAM-011`（Partial）
- **当前事实**：已支持 factor 列表、首因子注册、第二/备用 verified TOTP、Provider challenge/verify、session-bound recent proof；当前产品没有删除 **verified factor** 的受控入口，现有 unenroll 只清理 unverified enrollment。
- **要做**：增加 verified factor 删除产品入口；已有 factor 时先要求现有因子的 recent MFA；服务端重新验证目标 factor 属于当前管理员且为 verified；受控入口拒绝删除最后一个 verified factor；删除成功后刷新/收敛 session，并使旧 recent proof 失效。
- **并发要求**：覆盖两个标签/两个会话同时删除、删除目标在请求间变化、旧 proof 重放、session 撤销、membership 变化；不得只用按钮 disabled 作为保护。
- **已知 Provider 边界**：历史固定版本实测证明 Supabase 原生 unenroll 和双会话可以把 factor 删到 0。应用入口只能承诺“受控 Admin 路径保护”，除非另行设计并验证 Provider 层全局原子策略；不得在文档或 UI 夸大保证。
- **主要改动面**：Admin Auth/MFA route 与 UI、Account API/必要 private helper、OpenAPI、recent-proof invalidation、Local Supabase/API/browser tests。
- **完成条件**：第二因子可保留、备用因子可安全删除、最后因子在受控入口被拒绝、factor 变化后旧 proof 不可用、并发矩阵有真实 Local Supabase 证据。

### TODO-ADM-003 — Admin Web 全局安全头与 CSP

- **Requirement**：`REQ-ADM-010`（Planned）
- **当前事实**：应用级 `next.config.mjs` 尚无统一 security headers/CSP；Feedback binary proxy 的 sandbox CSP 只保护下载响应。
- **要做**：先读取候选部署真实响应头和代理层来源；建立 framing 防护（`X-Frame-Options: DENY` 或等价强制 `frame-ancestors 'none'`），再补 `nosniff`、Referrer-Policy、Permissions-Policy 等适用头；完整 CSP 先 Report-Only 验证。
- **兼容范围**：Next.js 静态资源、Supabase Auth/MFA、same-origin BFF、TOTP `data:` QR、下载响应必须回归。
- **发布边界**：HSTS 和完整强制 CSP 只有确认目标 HTTPS/域名/资源依赖并获得对应发布授权后启用；没有报告接收器时不声称生产 CSP reporting 已完成。
- **完成条件**：自动 header 断言 + 候选浏览器登录/MFA/API/QR/核心 workspace PASS；未解释 CSP violation 为 0；生产强制步骤单独记录。

## P1 — 当前 HEAD 集成验证与收口

### TODO-VERIFY-001 — 当前 HEAD Admin 安全全链路复验

- **依赖**：TODO-ADM-002、TODO-IAM-001、TODO-ADM-003；TODO-ADM-001 若同一候选发布则一并纳入。
- **原因**：2026-09 的 SEC 历史 PASS 以及后续 System Admin resilience 都是旧 HEAD 证据，不能自动证明当前候选。
- **要做**：冻结候选 commit/迁移/配置；覆盖匿名、普通用户、pending/active admin、AAL1/AAL2、recent proof 有效/过期、session revoke、factor add/delete、双会话竞争、上游 5xx/timeout、request ID/audit correlation、accepted/completed/failed、窄屏/键盘/焦点与 security headers。
- **完成条件**：所有不可豁免身份/权限/MFA/审计/并发/恢复检查有当前候选 PASS；失败不以删测试、放宽权限或排除场景解决。

### TODO-VERIFY-002 — 当前 HEAD 全仓本地 Release Gate

- **依赖**：准备发布的产品改动完成后执行。
- **原因**：历史 `TASK-0801` 的全量 Local PASS 对应旧代码；当前主干经历 prelaunch canonicalization、System Admin、Consumer surface 等大量演进。
- **要做**：按当前 `package.json`/开发发布流程重跑适用的 format/lint/typecheck/build/unit、Local Supabase reset + SQL、Account/Admin API、Maintenance/Billing Worker、并发恢复、Admin E2E、Consumer Harness、contracts/docs 和敏感信息检查。
- **完成条件**：以当前候选 SHA 记录真实命令/退出码；不存在必需的 FAIL/NOT_RUN/PARTIAL/BLOCKED。本地门禁通过不自动代表 Hosted/Provider/Production 通过。

## P2 — 按需环境、Provider 与恢复证据

这些项目主要是**部署/运行证据缺口**，不是“仓库里没有对应代码”。它们不能因为 Spec Delivery=Implemented 就被假定已在真实环境运行，也**不新增为普通代码合并的 Hosted Staging / 远程 Provider 测试门槛**；只有目标发布确实要启用、变更或声明对应生产能力时才执行适用项。

### TODO-OPS-001 — Hosted Maintenance / Billing Cron / Vault / 网关实证

- **当前事实**：Billing canonical migration 有数据库 Cron/pg_net 安装逻辑与 `billing_cron_invocations`；其他 `schedule.json` 条目大多仍只是 cadence metadata。
- **要做**：在目标 Hosted/Staging 核对实际函数 URL、网关前缀、verify_jwt/入口保护、executor role、Vault Secret、Billing token、pg_cron/pg_net 安装与真实触发；验证 401/404/5xx/timeout、重叠批次、lease/fence、恢复和 Secret 轮换。
- **告警**：确认告警阈值、接收器和送达/恢复链；空队列 200 不能替代一次真实 job 执行和一次故障恢复。
- **完成条件**：scheduler request、HTTP completion、Worker business result 三层都有脱敏证据；其他 maintenance 条目分别标明真实 scheduler 是否存在。

### TODO-PROVIDER-001 — Afdian Staging/受控 Provider 合同验收

- **触发条件**：需要首次开启真实购买、变更 Provider 适配/映射/退款处理，或需要明确声明真实渠道已经联调时执行；普通代码发布仍以 Local Provider Mock 为必需验收。
- **要做**：在明确隔离的测试/受控渠道环境验证 Mapping -> Checkout -> payment link -> Webhook signature -> `query-order` -> Observation -> Settlement -> Grant；覆盖分页、重复 webhook、同 event 异 hash、429/Retry-After、timeout/unknown、迟到 paid、unlinked paid/manual review 和无重复 Grant。
- **安全边界**：不把本地 Mock 当 Provider PASS；不在未授权情况下使用生产真实付款；测试账号、商品、金额、回调和清理范围必须先明确。
- **完成条件**：Provider facts、DB Order/Settlement/Grant/Job/Audit 和 Consumer/Admin 读模型一致；未知外部结果先查原交易，不靠创建第二笔订单恢复。

### TODO-OPS-002 — DB + Storage 备份恢复演练

- **要做**：验证 recovery set 同时包含数据库、Auth/必要 metadata、私有 Storage 对象、配置版本、deletion tombstone 和 Secret/Key re-issuance；实际演练 backup barrier、对象 manifest、恢复旧 DB 后重新应用 tombstone、防止已删除对象/身份复活。
- **恢复后检查**：撤销旧 Auth sessions、禁用恢复出的旧 Platform Key 和仍未兑换的旧 Code/Batch，重新对账 unknown write、deleting object、job lease/idempotency。
- **完成条件**：不是只证明“备份开关存在”，而是有可核对的对象恢复结果、残留/屏障检查和测得的 RPO/RTO；未实际演练时保持 NOT_RUN。

### TODO-OPS-003 — 落地生产 Retention Policy 来源与期限

- **当前事实**：代码已经 fail closed；`private.account_retention_policy` 缺 row 时不会猜固定天数。
- **要做**：由业务/法务/财务给出生产 personal-data retention days、policy source/reference 和责任人；按目标环境受控写入并验证 retention job 读取的是该政策。
- **边界**：数据库/Storage backup retention 与个人信息 retention 是不同政策，不互相替代。
- **完成条件**：目标环境存在可审计 policy 来源；缺政策时继续阻止自动匿名化，不用代码默认值绕过。

### TODO-CONSUMER-001 — 每个真实 Consumer 的接入验收

- **触发条件**：有具体目标平台要接入/发布时执行；不是中央仓库当前缺一个 runtime SDK。
- **要做**：目标 Consumer 依据 `platform-integration/` + canonical Account OpenAPI 自己实现 Auth/BFF/session/CSRF、server-only Platform Key、principal/activation、entitlement guard 和所需可选 capability；运行目标项目自己的 build/test/E2E 与 conformance。
- **完成条件**：中央 Harness PASS 只证明协议可实现；每个目标平台必须有自己的配置、Secret、Auth callback、BFF、业务路由和发布证据，才能声明该 Consumer 已接入。

## P3 — Production 发布

### TODO-RELEASE-001 — 当前候选的 G0–G5 生产前核对

- **依赖**：TODO-VERIFY-002；只核对本次候选实际涉及的生产能力。若要开启/变更真实支付、调度、Retention 等能力，再纳入对应 P2 项。
- **要做**：按发布流程 G0–G5 核对候选 SHA/产物、Local 验证证据、生产目标与配置、待应用迁移/hash/角色、旧数据兼容与本地升级演练、回退/forward-fix、停止开关、观察阈值和本次授权范围。迁移类任务仍须在 Local 同时证明空库迁移和“生产基线 schema + 合成旧数据”的升级，不要求另造 Hosted Staging 测试门槛。
- **完成条件**：发布清单中所有适用项可复查；数据账本不靠 down migration 删除恢复；未涉及项明确写不适用及理由。

### TODO-RELEASE-002 — 正式生产发布与 G6 观察

- **依赖**：适用 P0/P1/P2/P3 门槛完成，并获得本次生产动作的明确授权。
- **要做**：核对目标项目/域名/Auth/Origins/Keys/DB role/Provider/Vault/Cron；按批准清单部署/迁移/配置；发布后验证实际部署 SHA、核心页面/API、Job/告警、Billing/Entitlement/Audit，并按预设停止阈值观察。
- **边界**：生产真实付款、费用变化、Secret 切换、强制 CSP、真实管理员恢复等高风险动作若未被本次授权明确覆盖，继续保持 NOT_RUN。
- **完成条件**：部署成功和发布后观察分别记录；没有真实事件时不能用空日志或空队列宣称业务链路已验证。

## P4 — 文档维护（非发布阻塞）

### TODO-DOC-001 — 重建设计 `docs/development` 内容结构

- **当前事实**：2026-10-15 已把旧 Guide/治理内容完整收敛到 `docs/development`，但当时明确只做归属和链接迁移，不宣称内容已经重新设计。
- **要做**：后续按开发、测试、运维、发布、接入、文档治理的职责去重和重组，保持 `spec / architecture / plans / review` 权威边界不变。
- **完成条件**：没有第二套 Requirement/Architecture/合同定义；当前命令和路径可执行；`docs:check` / `contracts:check` 通过。

## 明确不列为 TODO 的旧目标

以下内容来自已完成/被替代的历史计划，不属于当前 Active Requirement，除非未来先新增/修改 Spec：中央 Consumer runtime SDK、生产 starter/template、Admin Consumer Lab、Afdian OAuth 收款、多支付渠道、自动 Provider 退款、真实 recurring subscription/MRR/ARR/churn、Passkey/SMS OTP、完整 Dark Mode、无痕管理员 impersonation。
