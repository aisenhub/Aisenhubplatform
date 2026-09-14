# 修复实施与验证记录

本文件记录本轮已获派发的局部实现与真实验证。[总计划](plan.md)中的研究基线仅为计划输入，不是实施成果。历史验证保留在[归档原记录](../../archive/subscription-billing-centralization/verification-record.md)，不得复制成当前结果。

## 当前修复状态

TASK-0001 基线冻结完成；TASK-0002 完成本地静态门槛审查但被 Hosted 配置/路径 forward-fix/真实调用阻塞；TASK-0101、TASK-0103、TASK-0301、TASK-0302、TASK-0303、TASK-0304、TASK-0305、TASK-0306、TASK-0402、TASK-0601、TASK-0603、TASK-0605、TASK-0609：本地实现及回归验证完成；其余TASK仍未开始或受前置门槛阻塞。D1/D2/D3、Provider、Staging、生产及发布门槛未完成，不能据此宣称阶段或生产完成。

## 前一批实施记录（2026-09-14）

| 项目 | 实际结果 |
| --- | --- |
| 授权范围 | 实施可独立落地的 TASK-0301（Provider fail-closed）、TASK-0302（过期 processing 接管及 fencing）、TASK-0303（分类重试/死信重排）与 TASK-0304（未关联 paid 隔离人工队列）；未展开退款、暂停、OAuth/用户认领、Admin/UI及远程部署。 |
| 分支与基线 | `codex/billing-architecture-review`；本轮起始 HEAD `d701d33`；TASK-0301/0302 提交 `96b0a1c`，TASK-0304 提交 `8fe03a0`；工作区原有文档和架构评审未跟随代码提交清理。 |
| 迁移 | Supabase CLI `2.111.0`；由 `supabase migration new` 生成 `20260914014339_repair_task_0301.sql`、`20260914014351_repair_task_0302.sql`、`20260914034134_repair_task_0304.sql`、`20260914042955_repair_task_0303.sql`；旧迁移未改。 |
| TASK-0301 | Provider unknown/pending 可恢复重试；Provider 必填字段、金额、币种、plan/type/SKU/quantity/month/mapping 采用显式 fail-closed 校验；不完整 paid 事实零 Grant 并进入 `manual_review`。Afdian 保留 SKU 数量并拒绝非法数量。 |
| TASK-0302 | 过期 `processing` job 可接管并递增 fence；query/link/verify/finish/cursor 全部校验 owner、fence、live lease；旧 worker 不得继续业务写入。maintenance billing context 传递真实 job ID。 |
| TASK-0304 | `billing_settlements` 对未关联范围允许平台/账户/Checkout/Grant 全为空，并以约束阻止关联结算丢失平台范围；Admin 列表支持 `unlinked`；未关联 Admin 结案使用 `global` 幂等作用域；不发生自动归属或 Grant。 |
| TASK-0303 | Job 增加累计 attempts、当前 retry cycle、max_attempts、dead-letter 和受控重排审计字段；timeout/429/not-found/Provider contract/业务冲突分类；退避含上限与 jitter；触顶进入 `manual_review/dead_letter`；仅允许带 operation_id/reason 的可恢复类别重排，重复 operation 幂等且最终结案/未关联订单不可复活。 |
| 本地数据库验证 | `pnpm test:db`：PASS，40 个文件、760 个断言。新增覆盖关联结算 scope 负例、缺 custom order 的 paid 未关联订单、人工队列、零 Grant、重复观察单 settlement、Admin 读取/筛选/结案及 global 幂等。 |
| 并发验证 | `pnpm run test:sql:bill-05-concurrency`：PASS；两订单并发结果为 `granted` 与 `duplicate_payment`，Grant=1，Settlement=2，完成 job=1，人工复核 job=1。 |
| Edge/domain验证 | Afdian Deno：10 passed；maintenance Deno：14 passed；Account API Deno：31 passed；`@kit/domain`：8 passed；并发探针 PASS。 |
| 静态及文档验证 | `pnpm lint`、`pnpm docs:check`、`pnpm contracts:check`、`git diff --check`、变更 TS 定向 `oxfmt --check`：PASS。全仓 `format:check` 仍受既有 59 个文件（含工作区原有架构评审产物）影响，未作无关格式化。 |
| 未完成验证 | `pnpm typecheck` 受既有 `packages/account-server/tests/authorization.test.ts` mock 缺少 `subscription_product` 阻塞；未修改无关测试。Provider/Staging/Production/E2E/UI：NOT_RUN。 |
| 恢复/发布 | 本轮仅重置本地 Supabase 并清理并发探针夹具；TASK-0301/0302/0304 已推送并快进远端 `main`；未部署。 |

## 追加实施记录（2026-09-14，TASK-0101/0305/0306）

| 项目 | 实际结果 |
| --- | --- |
| 授权范围 | TASK-0101（状态/事实/投影/错误合同）、TASK-0305（Webhook身份/冲突证据/ACK）与 TASK-0306（Checkout进度投影/过期读取）；未展开Provider真实验收、退款补偿、Consumer UI或远程部署。 |
| 分支与基线 | `codex/billing-architecture-review`；追加前 HEAD `0b34ca3`；TASK-0101 提交 `43928e0`，TASK-0305 提交 `0b34ca3`，TASK-0306 提交待完成；工作区原有文档和架构评审产物未纳入代码提交。 |
| TASK-0101 | 新增八类状态常量/类型/校验器、订单状态投影 DTO、OpenAPI `BillingCheckoutStatus`/`BillingOrderStatusProjection`，保留 `SubscriptionCheckoutStatus` 兼容别名；域单元 10/10、合同检查 PASS。 |
| TASK-0305 | Webhook事件键改为可信订单号，通用HMAC拒绝仅由header提供身份；同键异hash写入冲突证据并进入 `manual_review`，不创建第二任务；迁移 `20260914050122_repair_task_0305.sql`。 |
| TASK-0306 | 新增 `private.subscription_checkout_read_v2`，聚合 Provider/Verification/Entitlement/Job/Settlement 事实；`paid/granted/resolved` 不因过期降级，blocked/review 显示 `review_required`；Account API/OpenAPI/域合同同步 `progress`、reason 与 next_action；迁移 `20260914052934_repair_task_0306.sql`。 |
| 本地数据库验证 | `pnpm db:reset`：首次重启遇 Storage health 瞬态失败，重试 PASS；`pnpm test:db`：PASS，43 个文件、815 个断言。TASK-0305 与 TASK-0306 SQL 回归均 PASS。 |
| Edge/domain/API验证 | Account API Deno：32 passed；相关 Webhook/maintenance/Account API 组合回归及域单元已在本轮代码提交前后执行，当前 TASK-0306 定向 API 32/32、域 10/10 PASS。 |
| 静态验证 | `pnpm contracts:check` PASS；OpenAPI JSON 解析 PASS；`git diff --check` 待提交前复核。全仓 typecheck 仍受既有 account-server authorization mock 缺少 `subscription_product` 阻塞，未放宽测试。 |
| 外部环境 | Provider/Staging/Production/E2E/UI：NOT_RUN；未部署、未连接真实支付账户、未改变生产费用或凭据。 |

## 追加实施记录（2026-09-14，TASK-0402）

| 项目 | 实际结果 |
| --- | --- |
| 授权范围 | TASK-0402：拆分 Provider 观察更新与幂等结算动作；未展开退款外部 API、生命周期政策或远程部署。 |
| 变更 | 新增 `public.billing_order_observations` 观察历史表及 domain-owner 隔离；重定义 `private.billing_order_verify_and_settle`：每次观察先落事实，`finalized` 结案只刷新观察不复活 Grant，`review_required` 可用新事实重新核验；并发探针清理新增观察记录。迁移 `20260914055016_repair_task_0402.sql`。 |
| 本地数据库验证 | `pnpm db:reset` PASS；`pnpm test:db` PASS，44 个文件、833 个断言；新增 `bill_10_settlement_observation.sql` 18/18 PASS。 |
| 并发/运行验证 | 本地 `test:sql:bill-05-concurrency` PASS：决策 `duplicate_payment, granted`，Settlement=2、Grant=1、完成Job=1、复核Job=1；Webhook/maintenance/Account API/Afdian Deno 66/66 PASS；域单元 10/10 PASS。 |
| 清理与边界 | 首次并发探针暴露新增观察表 FK 未纳入清理，已修复探针先删观察再删 Job，并清理本地 fixture；Provider/Staging/Production/E2E/UI：NOT_RUN。 |

## 追加实施记录（2026-09-14，TASK-0601）

| 项目 | 实际结果 |
| --- | --- |
| 授权范围 | TASK-0601：Admin 账单列表服务端筛选、稳定复合游标和增量加载；未展开平台范围策略、完整订单时间线、人工操作幂等或远程部署。 |
| 迁移与实现 | Supabase CLI `2.111.0` 生成 `20260914060714_repair_task_0601.sql`；新增 `admin_billing_order_list_v2`、`created_at + id` 复合排序游标及平台/账户/Provider/订单号筛选索引；保留旧函数和 ISO 游标兼容路径。同步 Account API、Admin OpenAPI、Admin UI。 |
| SQL/API验证 | `pnpm db:reset` PASS；`pnpm test:db` PASS，45 个文件、849 个断言；新增 `bill_13_admin_billing_pagination.sql` 覆盖同时间戳分页不漏项、未关联筛选、组合筛选、游标配对和 limit 上限；Account API Deno 33/33 PASS。 |
| 静态/前端验证 | `pnpm --filter admin typecheck` PASS；`pnpm --filter @kit/domain test:unit` 10/10 PASS；`pnpm contracts:check` PASS；`pnpm docs:check` PASS；定向 `oxlint`、`oxfmt --check`、`git diff --check` PASS。 |
| 全仓已知阻塞 | `pnpm typecheck` 仍只在既有 `packages/account-server/tests/authorization.test.ts` mock 缺少 `subscription_product` 处失败；未放宽无关测试。全仓格式检查的既有 59 文件问题未因本任务扩大范围。 |
| 外部环境 | Provider/Staging/Production/E2E/真实浏览器可访问性：NOT_RUN；未连接真实支付账户、未改变费用或凭据。 |
| Commit与push | TASK-0601 提交 `1e72b6b`；`origin/main` 与 `origin/codex/billing-architecture-review` 均核对为 `1e72b6b1cceaa073a6224acaae5d812e576f5a2d`。 |

## 追加实施记录（2026-09-14，TASK-0609）

| 项目 | 实际结果 |
| --- | --- |
| 授权范围 | TASK-0609：Admin Billing 重查/结案的 operation_id 请求绑定、幂等原样重放和 If-Match 顺序；未展开 Provider 重查流程、生命周期/退款政策或远程部署。 |
| 迁移与实现 | Supabase CLI `2.111.0` 生成 `20260914062808_repair_task_0609.sql`；重查与结案在版本校验前读取 `private.admin_idempotency`，记录订单/动作/版本/原因哈希和响应；跨订单或同 ID 异参拒绝。Admin UI 网络结果未知时保留同一 operation_id 重试。 |
| SQL/API验证 | `pnpm db:reset` PASS；`pnpm test:db` PASS，46 个文件、869 个断言；新增 `bill_14_admin_operation_idempotency.sql` 覆盖重查/结案原样重放、同 ID 异参、跨订单复用、旧版本新操作和最终状态。Account API Deno 33/33 PASS。 |
| 静态/前端验证 | `pnpm --filter admin typecheck` PASS；定向 `oxlint`、`oxfmt --check`、`git diff --check` PASS。 |
| 外部环境 | Provider/Staging/Production/Admin E2E/可访问性：NOT_RUN；未连接真实支付账户、未改变费用或凭据。 |
| Commit与push | TASK-0609 提交 `124df42`；`origin/main` 与 `origin/codex/billing-architecture-review` 均核对为 `124df425e49e634c5e93223328316b5288a82c2e`。 |

## 追加实施记录（2026-09-14，TASK-0603）

| 项目 | 实际结果 |
| --- | --- |
| 授权范围 | TASK-0603：Admin 订单详情时间线；聚合订单、Checkout、Provider Webhook、processing Job、Provider observation、Settlement、Grant/Event/correction 与订单级 Admin audit；未展开退款政策、真实Provider或远程部署。 |
| 迁移与实现 | Supabase CLI `2.111.0` 由 `supabase migration new repair_task_0603` 生成 `20260914064806_repair_task_0603.sql`；新增 `admin_billing_order_read_v2`，按 `event_at/source/entity_id` 稳定排序，分离 `provider_event_at` 与本地 `received_at/observed_at`，审计 metadata 仅保留白名单字段；新增订单任务/审计目标索引，旧详情函数保留兼容。同步 Account API、Admin OpenAPI、Admin 时间线 UI。 |
| 失败与边界回归 | 新增 `bill_15_admin_billing_timeline.sql` 16/16：无历史证据混入、Provider 时间不由接收时间伪造、同Provider账户其他订单隔离、审计 secret 字段不泄露、时间线稳定排序、完成Job不计入open任务。 |
| SQL/API验证 | `pnpm db:reset` PASS；`pnpm test:db` PASS，47 个文件、885 个断言；Account API Deno 33/33 PASS，详情路由确认调用 v2 并返回 timeline。 |
| 静态/前端验证 | `pnpm --filter admin typecheck` PASS；`pnpm --filter @kit/domain test:unit` 10/10 PASS；`pnpm contracts:check` PASS（account=21、admin=44 operations）；`pnpm docs:check` PASS（63 documents）；定向 `oxlint`、`oxfmt --check`、`git diff --check` PASS。 |
| 外部环境 | Provider/Staging/Production/Admin E2E/真实浏览器可访问性：NOT_RUN；未连接真实支付账户、未改变费用或凭据。 |
| 已知限制 | `pnpm typecheck` 的既有 account-server authorization mock 缺少 `subscription_product` 阻塞仍未处理；全仓格式检查的既有59文件问题未扩大范围；本任务未执行真实并发探针、Provider和Admin E2E。 |
| Commit与push | TASK-0603 提交 `800e416`；`origin/main` 与 `origin/codex/billing-architecture-review` 均核对为 `800e41689584b6da677d440ef9b38e327023d1ef`；proposal记录保留在工作区，不纳入本任务代码提交。 |

## 追加实施记录（2026-09-14，TASK-0605）

| 项目 | 实际结果 |
| --- | --- |
| 授权范围 | TASK-0605：Admin 账单详情中的 Webhook/Job 独立状态和租约诊断；未展开Provider真实调用、任务接管动作、远程部署或Admin E2E。 |
| 迁移与实现 | Supabase CLI `2.111.0` 由 `supabase migration new repair_task_0605` 生成 `20260914071235_repair_task_0605.sql`；新增 `admin_billing_order_read_v3` 包装 v2 时间线，增加签名结果、hash前缀、关联Job、attempts/max_attempts、next_attempt、lease_until、失联 health、错误分类和 owner fingerprint；原始payload、owner原文不返回。Account API/Admin UI切换到v3，旧v2函数保留。 |
| 失败与边界回归 | 新增 `bill_16_admin_billing_diagnostics.sql` 15/15：Webhook签名与Job状态不混用、过期processing租约标记`lost`、retry预算可见、next_attempt与lease_until区分、hash/owner脱敏。 |
| SQL/API验证 | `pnpm db:reset` PASS；`pnpm test:db` PASS，48 个文件、900 个断言；Account API Deno 33/33 PASS。 |
| 静态/前端验证 | `pnpm --filter admin typecheck` PASS；`pnpm --filter @kit/domain test:unit` 10/10 PASS；`pnpm contracts:check` PASS（account=21、admin=44 operations）；`pnpm docs:check` PASS（63 documents）；定向 `oxlint`、`oxfmt --check`、`git diff --check` PASS。 |
| 外部环境 | Provider/Staging/Production/Admin E2E/真实浏览器可访问性：NOT_RUN；未连接真实支付账户、未改变费用或凭据。 |
| 已知限制 | `pnpm typecheck` 的既有 account-server authorization mock 缺少 `subscription_product` 阻塞仍未处理；全仓格式检查的既有59文件问题未扩大范围；本任务未执行真实并发接管探针。 |
| Commit与push | TASK-0605 提交 `9aad937`；`origin/main` 与 `origin/codex/billing-architecture-review` 均核对为 `9aad9371f35a830705d734c249d5af349ee3ad59`；proposal记录保留在工作区，不纳入本任务代码提交。 |

## 追加实施记录（2026-09-14，TASK-0001）

| 项目 | 实际结果 |
| --- | --- |
| 基线与归属 | 当前分支 `codex/billing-architecture-review`；代码 HEAD `e470d64c4fad86abe0696064239e993e53cee362`；`origin/main` 与工作分支均核对为该 SHA。用户已有的 AGENTS/架构/指南、proposal 目录和架构评审产物保持未暂存状态。 |
| 实际命令入口 | 已核对并实际使用 `pnpm typecheck`、`pnpm docs:check`、`pnpm contracts:check`、Domain/Account Server Vitest 与 Account API Deno runner；模板无测试文件，未把无测试命令计为 PASS。 |
| 安全与环境边界 | 未读取或记录 Secret；TASK-0001 不执行写 DB、Provider、Staging、Production、真实支付或既有浏览器会话操作；外部配置、备份、网关、恢复和发布证据 NOT_RUN。 |
| 结论 | TASK-0001 本地基线冻结 PASS；TASK-0002 仍需运行配置门槛核对，TASK-0003 的 D1/D2/D3 仍需业务策略授权；本记录不关闭 F01–F17。 |
| Commit与push | 代码基线使用既有 `e470d64`；TASK-0001 记录仍位于用户已有 proposal 工作区，未单独提交或推送。 |

## 追加实施记录（2026-09-14，TASK-0002 静态门槛审查）

| 项目 | 实际结果 |
| --- | --- |
| 静态路径核对 | `supabase/functions/maintenance/index.ts` 与 `schedule.json` 的真实路由为 `/maintenance/v1/billing/jobs/run`；历史 `20260913112306_bill_16_billing_worker_cron.sql` 从 Vault 基址追加 `/v1/billing/jobs/run`。只有当 Vault 中的 `billing_maintenance_function_url` 已包含 `/maintenance` 时才一致，仓库不记录该 Secret 值，当前无法证明。 |
| 配置与权限 | cron 只读取 Vault 的 `billing_maintenance_function_url`/`billing_maintenance_job_token`，缺失时静默 return；Maintenance 运行时使用 `MAINTENANCE_JOB_TOKEN`，并要求 Supabase URL/Secret。当前本地未读取 Hosted Vault、pg_net response、Job Token 或生产配置。 |
| 预算与失败边界 | cron `timeout_milliseconds=5000`、body `limit=5`；Maintenance handler 有 5 秒请求边界。尚未以真实网关验证路径、401/404/内部503、超时、重叠批次、密钥轮换或 cron 结果告警。 |
| 结论 | 本地静态门槛审查 PARTIAL；路径 forward-fix 和 Hosted HTTP/pg_net/恢复证据 BLOCKED/NOT_RUN，不修改已应用 BILL-16 迁移，不把历史 staging 记录移作本轮证据。 |
| Commit与push | TASK-0002 仅形成 proposal 工作区记录，未单独提交或推送；后续需授权并完成 forward-fix/远程验证后再形成代码提交。 |

## 追加实施记录（2026-09-14，TASK-0103）

| 项目 | 实际结果 |
| --- | --- |
| 授权范围 | TASK-0103：建立数据库→Edge→OpenAPI→Domain DTO→Account SDK/BFF→Consumer/Admin UI→Registry→测试责任的字段级兼容清单；未展开数据库迁移、Provider真实调用、版本混跑探针或远程部署。 |
| 实际变更 | 新增 `docs/reference/contract-consumers.json` 与 `contract-consumer-matrix.md`；`contracts:check` 接入 `tooling/scripts/src/contract-consumer-check.mjs`，校验4个合同、39个字段、生产者/Edge/消费者/测试负责人/OpenAPI schema；模板页面复用共享 Domain DTO，拒绝非法商品响应，Account API 对异常商品行 fail-closed 返回503；补齐模板 workspace 依赖、Account Server entitlement mock。 |
| 失败与恢复回归 | Domain `TASK-0103-NEG` 覆盖金额、期限、列表结构负例；Account API 增加异常商品行 503 回归；Account SDK 保留服务端 Platform Key/no-store 边界及 checkout 合同测试；未新增真实双连接版本混跑探针。 |
| API/Domain/Consumer验证 | Account API Deno 34/34 PASS；`@kit/domain` 11/11 PASS；`@kit/account-server` 16/16 PASS；template-preview/admin/domain/account-server typecheck PASS；全仓 `pnpm typecheck` PASS。 |
| 静态/合同验证 | `pnpm contracts:check` PASS（account=21、admin=44 operations；4 contracts/39 fields）；`pnpm docs:check` PASS；定向 `oxlint`、`oxfmt --check`、`git diff --check` PASS。无数据库变更，因此未重复执行 `db:reset/test:db`。 |
| 外部环境 | Provider/Staging/Production/Consumer/Admin E2E/真实浏览器可访问性/版本混跑：NOT_RUN；未连接真实支付账户、未改变费用或凭据。 |
| Commit与push | 代码提交完成后填写；proposal记录保留在工作区，不纳入本任务代码提交。 |

## 每任务填写

- TASK/问题ID：待实际执行填写
- 授权范围与环境：待填写
- 起始分支/HEAD/工作区文件归属：待填写
- 实际变更文件、迁移CLI命令/版本、迁移ID/前置/应用顺序：待填写
- SQL/API/OpenAPI/DTO/SDK/BFF/UI/Registry消费者同步：待填写
- 修复前失败用例与证据：待填写
- 当前行为与修复后断言：待填写
- 结果（PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED）：NOT_RUN
- 静态/单元/SQL权限/API/并发/Webhook/Provider/Consumer/Admin E2E/可访问性类别：逐项填写
- Local/Staging/Production：分别记录，未执行写NOT_RUN
- 命令、退出码、执行时间、被测HEAD、脱敏输出：待填写
- Provider事实、DB Order/Settlement/Grant/Event/Job/Audit最终状态、UI：待填写
- 重复扣款/错误或重复Grant/漏单/损失/泄露/越权结论及依据：待填写
- 恢复/回退实际结果、已知不可逆边界：待填写
- Fixture残留/临时进程清理：待填写
- 未完成/阻塞/责任人/下一任务：待填写
- Commit与push：TASK-0301/0302 提交 `96b0a1c`、TASK-0304 提交 `8fe03a0` 已推送到工作分支；`origin/main` 与工作分支均核对为 `8fe03a0`。

## 追加实施记录（2026-09-14，TASK-0702）

| 项目 | 实际结果 |
| --- | --- |
| 授权范围 | TASK-0702：修正 Billing Cron 路由契约、请求受理/HTTP完成/Worker业务结果观测和有界保留；不修改已应用 BILL-16，不放开 verify_jwt，不连接 Hosted Vault/真实 Provider。 |
| 起始与归属 | 分支 `codex/billing-architecture-review`；起始 HEAD `68e6799`；保留工作区已有 AGENTS/架构/指南和架构评审产物，不纳入本任务。 |
| 实际变更 | 新增 `20260914081243_repair_task_0702.sql`：规范化 `/maintenance/v1/billing/jobs/run`，拒绝错误基址、query/fragment 和缺失运行 Secret；记录 scheduler skip/queue failure、pg_net request id、HTTP状态/超时、处理数量/失败数量和脱敏错误码；响应历史保留30天。新增 `repair_task_0702_billing_worker_cron.sql` 覆盖路径、权限、RLS、响应成功/失败/超时；同步安全测试、配置和运维文档。 |
| 数据库验证 | `pnpm db:reset -- --yes` PASS；`pnpm test:db` PASS：49 个 SQL 文件、920 个断言。新增任务用例通过；RLS 数量回归由14同步为15。 |
| Worker/静态验证 | `pnpm test:maintenance` PASS：15/15；`pnpm contracts:check` PASS（account=21、admin=44；4 contracts/39 fields）；`pnpm docs:check` PASS（64 documents）；`pnpm typecheck` PASS（9/9）；`git diff --check` PASS。 |
| 外部环境 | Hosted Vault、真实 pg_cron/pg_net HTTP、网关路径、401/404/503、超时、重叠批次、Secret 轮换、告警和恢复演练：NOT_RUN；不能以 Local 结果代替。 |
| 结论 | TASK-0702 Local 实现及回归 PASS；G-OPS 和 Staging 门槛仍未完成，下一项可独立任务为 TASK-0703，但其告警实现需明确阈值、接收人和 Hosted 证据。 |
| Commit与push | TASK-0702 提交 `c562f52` 已推送 `origin/codex/billing-architecture-review`；因 R3 的 Hosted/Staging 门槛未完成，本提交暂未合并 `main`。 |

## 外部门槛

| 门槛 | 当前结果 | 所需证据 |
| --- | --- | --- |
| G-DEV修复回归 | NOT_RUN | 当前代码真实本地链路和全部反例 |
| G-PROVIDER | NOT_RUN | 当前商品签名/权威查询/退款/分页/失败合同 |
| G-OPS | NOT_RUN | 调度预算、告警、轮换、停机接管、备份恢复 |
| Staging等价升级 | NOT_RUN | 独立环境、完整迁移和旧数据兼容 |
| 生产发布批准 | NOT_RUN | 门槛审核及实际用户授权 |
| 生产观察 | NOT_RUN | 发布后限定窗口的实际运行与对账 |

失败保留并追加复测，不覆盖原失败。值班/阈值/期限/负责人不明确时写BLOCKED，不补虚构姓名或结果。

## 本轮计划文档检查（2026-09-13）

以下仅证明计划文档可导航、结构完整和已有合同静态结构有效，不是任何修复实现或业务验收结果。

| 检查 | 结果 | 本轮实际证据 |
| --- | --- | --- |
| `pnpm docs:check` | PASS | exit 0；61 documents，必需入口、本地链接及导航一致 |
| `pnpm contracts:check` | PASS | exit 0；Account 21／Admin 44 operations，refs/sample/binary/no-store 静态校验 |
| 计划结构、覆盖、依赖及文件引用 | PASS | 外部只读检查脚本 exit 0；16份计划文档、9阶段、56个唯一TASK、17问题均映射；Consumer 12／Admin 14；各阶段16节、各任务20字段；无依赖环和断链 |
| 既有文件保护核对 | PASS | 8个原未跟踪图表文件及18个归档文件的SHA-256与本轮写计划前一致 |
| Provider、Staging、生产验证 | NOT_RUN | 本轮未连接真实 Provider、Staging 或生产 |

检查不改变其余TASK未开始状态；远程提交状态已由 `git ls-remote` 核对。最终工作区及静态复核在本轮回复报告。
