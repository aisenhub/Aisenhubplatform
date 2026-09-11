# 实施与验证记录

> BILL-01～BILL-06 已记录本地 G-DEV 结果，BILL-07 已完成本地最终检查；真实 Provider、运维和生产证据仍保持独立状态。

## 1. 执行基线

- 架构：[唯一设计](AisenFlow_Subscription_Billing_Architecture.md)；本轮实现代码 commits：`d587ca4`, `b91800f`, `fa3083e`, `f1bfba1`, `d71a259`, `b7ec484`, `7b46695`。
- 计划：[总计划](00-master-plan.md)；本轮实现代码 commits：`d587ca4`, `b91800f`, `fa3083e`, `f1bfba1`, `d71a259`, `b7ec484`, `7b46695`。
- 工作目录/branch/功能实现基线/remote：`E:\Projects\Aisenhubplatform` / `codex/billing-architecture-review` / `d71a259` / `origin=https://github.com/aisenhub/Aisenhubplatform.git`；Consumer 功能提交 `d71a259`、公共文档同步提交 `e78c5e9` 均已 push。
- Node `v24.19.0`、pnpm `11.18.0`、Supabase CLI `2.111.0`、Deno `2.9.6`；Local DB reset、Docker 数据库和迁移测试已验证；调度与生产观察未验证。
- 基线：`pnpm docs:check` PASS；`pnpm contracts:check` PASS；`pnpm runtime:probe` PASS；`pnpm typecheck` PASS；全仓 `pnpm format:check` FAIL（72个文件，10个本轮变更文件已定向 oxfmt PASS）；`pnpm lint` PASS；`pnpm test:api` 未运行且为占位入口。
- 当前用户实际派发阶段与授权范围：按 proposal 完成 BILL-01～BILL-07；当前仅本地合同、数据库、API、SDK 与管理界面实现，不含真实付款、Provider/Webhook 配置、生产迁移或部署。
- 历史研究d3c25e9不是执行起点；本轮文档修订不作为任何功能验证。

## 2. 阶段状态

| 阶段 | 状态 | 实现/剩余 | commit/push |
|---|---|---|---|
| BILL-01 | G-DEV 已完成 | Provider-neutral 合同、虚构适配器夹具、Node/Deno MD5/HMAC 向量已验证；G-PROVIDER 未运行 | `20a28ed` / `4abb87b`，已 push |
| BILL-02 | 本地验收已交付 | 固定商品目录、期限语义、平台商品配置、切换 preflight、Account API/SDK/OpenAPI/Admin UI 已实现；Provider 映射未配置，真实购买关闭 | `503f14c` / `fdd106f`，已 push |
| BILL-03 | 本地验收已交付 | Redemption V2 快照、历史兼容、统一码规范化、Admin correction 预览/原子替代链、Admin/API 接入已实现；真实结算未运行 | `5dba4bd`，已 push |
| BILL-04 | 本地验收已交付 | 服务端定价Checkout snapshot、Order/Settlement关系、hash-only Webhook Inbox、持久 processing job、lease/fence、Account API/SDK/OpenAPI 和 maintenance 入口已实现；真实 Provider/权威结算未运行 | `7169183` + `c3b99b3`，已 push |
| BILL-05 | 本地验收已交付 | Provider-neutral 事实归一化、权威验证/结算、重复款/合同冲突、双进度游标、maintenance Provider I/O 边界已实现；真实 Provider 未运行 | `d587ca4`，已 push |
| BILL-06 | 本地验收已交付 | 中央 Billing Admin wrapper/UI、operation_id/If-Match/MFA 结案边界、Consumer Auth/BFF、动态订阅 Checkout/兑换页面、服务端权益授权已实现；结案 operation 使用已有 admin_idempotency 结果存储；Admin UI 已暴露重查和三种受控结案动作；浏览器真实 Consumer/生产未运行 | `b91800f` + `fa3083e` + `f1bfba1` + `d71a259`，已 push |
| BILL-07 | 本地最终检查已完成 | Local reset、全量 SQL/API/SDK/前端/合同/文档回归完成；升级兼容 fixture、独立 stop switch 演练和 Checkout fail-closed 验证已完成；真实生产等价升级数据、G-PROVIDER、G-OPS、生产观察未运行 | `b7ec484` + `7b46695`，已 push；文档同步随本记录提交 |

状态可用未开始/进行中/已阻塞/验证失败/验收通过待推送/已交付。已交付仅指该阶段明确范围，真实渠道和运维门槛另列；整体未满足不能Completed。

## 3. 门槛与协议证据

| 门槛 | 状态 | 证据/缺口 |
|---|---|---|
| G-DEV | PASS | `packages/domain/src/contracts/billing.ts` 冻结四商品期限、金额字符串、Checkout snapshot、Provider snapshot、操作来源/版本和结算状态；BILL-02 增加固定商品目录/配置与合同；BILL-03 增加 Redemption V2 snapshot、码规范化和 correction 链；BILL-04 增加 Checkout/Order/Inbox/Job schema、Account checkout DTO/SDK、hash-only webhook 和 lease/fence maintenance；BILL-05 增加 Provider-neutral 归一化、验证/结算、游标和 worker；BILL-06 增加中央 Billing Admin、Consumer Auth/BFF、服务端授权和动态订阅页；Node/Deno/SQL/前端固定测试通过 |
| G-PROVIDER | NOT_RUN | 真实渠道未验证 |
| G-OPS | PARTIAL_LOCAL | 本地 stop switch、停机不写库/不查 Provider、lease 可恢复路径已由 maintenance/webhook/API fixture 验证；真实调度密钥、限流预算、告警责任人与恢复演练仍未运行 |

| 协议项目 | 官方来源/日期/版本 | 脱敏操作与结果 | 状态 |
|---|---|---|---|
| custom_order_id传递/长度/query回显 | [官方开发者文档](https://guide.afdian.com/creator/developer)（2026-09-11；公开页未出现该字段） | 用户脱敏样例也未出现；不得自动绑定 | NOT_RUN |
| 重复链接/调价/撤销能力 | 官方公开页未覆盖 | 未执行真实 Checkout | NOT_RUN |
| plan/type/SKU/count/month/currency | 官方公开页记录 `plan_id`、`month`、`product_type`、`sku_detail`、金额字段；未冻结当前商品映射 | 仅本地 DTO/fixture；无真实商品查询 | NOT_RUN |
| 签名原文/可信公钥/query权威 | 官方公开页记录 MD5(token+排序后的 key/value)，并给出请求时间窗口示例；无公钥合同 | MD5/HMAC 本地固定向量通过；未发起真实 ping/query | NOT_RUN |
| discount/redeem/零元 | 官方公开页描述 `total_amount`/`show_amount`/`discount`/`redeem_id`字段 | 无真实订单/优惠验证 | NOT_RUN |
| 限流/分页/历史可查/失败 | 官方公开页记录 query-order 按创建时间倒序分页、每页50；失败/限流实际行为未验证 | 未执行真实 API | NOT_RUN |
| Supabase固定版本/runtime/相关更新 | 本地固定 Supabase CLI 2.111.0、Deno 2.9.6 | `runtime:probe` PASS；无数据库迁移 | PASS（开发工具链） |

不保存真实密钥、code、完整URL、订单个人数据；凭据只标configured/missing。真实付款授权依据单列，不从计划推断。

用户提供的脱敏 Provider 调试参考：[afdian-debug-reference.md](afdian-debug-reference.md)。当前样例未包含 `custom_order_id`；该事实已登记为 G-PROVIDER 待验证项，不得将样例视为自动用户绑定证据。用户消息中的 API Token 未保存，建议重新生成。

## 4. 每阶段记录模板

- BILL-01/2026-09-11/当前 Agent/起始HEAD：`2d058a4149017099b030d20d5382c0fa35d9fd80`。
- 实际变更文件：`packages/domain/src/contracts/billing.ts`、`packages/domain/src/contracts/index.ts`、`packages/domain/tests/billing.test.ts`、`packages/domain/tests/fixtures/fictional-provider.ts`、`tests/spikes/billing/crypto-vectors.mjs`、`package.json`，以及本记录和跨模块合同说明。
- 实现行为：固定 `free/monthly/yearly/lifetime`；`lifetime=finite/99/year`；金额仅接受两位小数十进制字符串；Provider 订单是观察 DTO；Checkout 保存平台/账户/商品/期限/价格/Provider 映射/自定义订单标识快照；结算状态区分可重试、人工审核与最终 granted/rejected。
- 依赖门槛/偏差：G-DEV 已通过；G-PROVIDER、G-OPS 未运行。未新增迁移、真实 Adapter、Webhook、Checkout 路由或权益写入。
- 验证命令：`pnpm test:billing:crypto` PASS；`pnpm test:billing:crypto:deno` PASS；`pnpm --filter @kit/domain test:unit --run` PASS（2 files/6 tests）；`pnpm --filter @kit/domain typecheck` PASS；串行 `pnpm typecheck` PASS（9/9）；串行 `pnpm build` PASS（admin/template-preview 成功，保留既有导出 warning）。
- 全量 `pnpm test:unit` 未通过：已执行的 domain/ui/account-auth/account-server/account-auth-nextjs 测试通过，`template-preview` 因没有测试文件按 Vitest 返回失败；不将其记为 PASS。全量 `pnpm lint` 与 `pnpm format:check` 仍为基线失败，详见执行基线。
- 覆盖范围：静态类型和本地单测/固定向量；未覆盖真实 Provider、Local DB、调度、生产观察。
- 代码commit：`20a28ed`（`feat(billing): establish provider-neutral contract foundation`）；已 push 到 `origin/codex/billing-architecture-review`，远端 SHA 核对为 `20a28ed`。
- 未完成/阻塞/下一满足依赖任务：真实 Provider 协议与最小联调缺失，保持 purchasable/真实购买关闭；下一满足依赖任务为 BILL-02，但仍需单独派发。

实现时逐阶段追加，不覆盖失败历史；记录自身SHA可单独提交，不循环amend。

### BILL-02/2026-09-11/当前 Agent

- 实际变更文件：`supabase/migrations/20260911120819_bill_02_subscription_product_catalog.sql`、`supabase/tests/bill_02_subscription_product_catalog.sql`、`packages/domain/src/contracts/api.ts`、`packages/domain/src/contracts/index.ts`、`packages/account-server/src/index.ts`、`packages/account-server/tests/client.test.ts`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`docs/reference/contracts/account.openapi.json`、`docs/reference/contracts/admin.openapi.json`、`tooling/scripts/src/openapi-check.mjs`、`apps/admin/features/platform-settings/subscription-config-panel.tsx` 及对应架构/合同/Proposal 文档。
- 实现行为：固定 `free/monthly/yearly/lifetime` 四项目录；`lifetime` 是 finite/99/year；平台配置只允许同平台 active paid Plan，恰好一个 active paid Plan 时自动回填且不重映射已有配置；计划切换在 active/future grant 或旧计划可兑换批次存在时阻断；无 Provider product mapping 时 paid 商品明确 `purchasable=false/provider_mapping_unavailable`；管理写入使用 row version/If-Match、锁序与最近 MFA 边界。
- 验证命令：`pnpm exec supabase db reset --local --yes` PASS；`pnpm test:db` PASS（29 files/473 tests）；`pnpm contracts:check` PASS（account=19/admin=38）；`pnpm docs:check` PASS（44 documents）；`pnpm exec deno test -A supabase/functions/account-api/index.test.ts` PASS（21 tests）；`pnpm --filter @kit/account-server test:unit` PASS（2 files/14 tests）；`pnpm sdk:pack` PASS；domain/account-server/admin typecheck PASS；`git diff --check` PASS。
- Supabase lint：`pnpm exec supabase db lint --local --fail-on error` 未通过，但仅报告已有 `admin_account_*`、`admin_file_policy_update`、`admin_deletion_job_*` 等函数的既有 error，以及本阶段函数的未使用变量 warning；BILL-02 无新增 lint error。全量 lint/format 的既有失败继续保留，不改写为 PASS。
- 覆盖范围：本地迁移 reset、pgTAP、API 单测、SDK 单测、类型、OpenAPI 和文档；未覆盖真实 Provider、真实付款、Webhook、调度、生产迁移与生产观察。
- 代码commit：`503f14c`（`feat(billing): implement subscription catalog and config`）；已 push 到 `origin/codex/billing-architecture-review`，远端 SHA 核对为 `503f14cd8c04d8b1d7c551c0acf1e68cf0bb37ad`。
- 未完成/阻塞/下一满足依赖任务：BILL-02 不启用真实购买；下一项为 BILL-03，继续补齐兑换码模型版本快照、生命周期与校正链。

### BILL-03/2026-09-11/当前 Agent

- 实际变更文件：`supabase/migrations/20260911124902_bill_03_redemption_v2_lifecycle.sql`、`supabase/tests/bill_03_redemption_v2_lifecycle.sql`、`packages/domain/src/redemption.ts`、`packages/domain/tests/billing.test.ts`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`apps/admin/features/redemption/platform-redemption-batches-page.tsx` 及对应架构/API/Proposal 文档。
- 实现行为：批次增加 `model_version` 与不可变 product/term/duration snapshot；V2 只接受 monthly/yearly/lifetime，lifetime 固定 finite/99/year；旧 model_version=1 批次保持原 Plan/duration/HMAC 解释；统一 normalize/validate/format 去除明确分隔符但保留 16–128 合法历史输入；Admin correction 以独立 operation、预览事件版本和强 FK 原子 revoke+grant 形成单一替代链。
- 验证命令：`pnpm exec supabase db reset --local --yes` PASS；`pnpm test:db` PASS（30 files/513 tests）；`pnpm --filter @kit/domain test:unit --run` PASS（2 files/7 tests）；`pnpm --filter @kit/domain typecheck` PASS；`pnpm exec deno test -A supabase/functions/account-api/index.test.ts` PASS（21 tests）；`pnpm --filter admin typecheck` PASS；`git diff --check` 待提交前复核。
- Supabase lint：`pnpm exec supabase db lint --local --fail-on error` 未通过，但只剩仓库既有 `admin_account_*`、`admin_file_policy_update`、`admin_deletion_job_*` 等 error；BILL-03 未新增 error，新增函数没有 lint error。全量 lint/format 的既有失败继续保留，不改写为 PASS。
- 覆盖范围：本地迁移 reset、pgTAP、Domain/API/Admin 定向测试与类型；未覆盖真实 Provider、真实结算、Webhook、调度和生产观察。
- 代码commit：`5dba4bd`（`feat(billing): add redemption v2 lifecycle and corrections`）；已 push 到 `origin/codex/billing-architecture-review`，远端 SHA 核对为 `5dba4bd33fc4786debbce4ff525001b1ae7ef226`。
- 未完成/阻塞/下一满足依赖任务：BILL-03 不提供商业永久/Free claim；下一项为 BILL-04，建立可恢复 Checkout、Order、Inbox 与持久任务。

### BILL-04/2026-09-11/当前 Agent

- 实际变更文件：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`、`supabase/tests/bill_04_checkout_order_inbox_jobs.sql`、`supabase/functions/_shared/billing.ts`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`supabase/functions/billing-webhook/index.ts`、`supabase/functions/billing-webhook/index.test.ts`、`supabase/functions/maintenance/index.ts`、`supabase/functions/maintenance/index.test.ts`、`supabase/functions/maintenance/schedule.json`、`packages/domain/src/contracts/api.ts`、`packages/account-server/src/index.ts`、`docs/reference/contracts/account.openapi.json` 及对应合同/架构文档。
- 实现行为：新增 Provider Account/Product mapping、不可变价格/期限 Checkout snapshot、可关联或暂不关联的 Order、hash-only Webhook Inbox、Processing Job lease/fence、Settlement 与 billing grant 强FK；Account POST 只接收固定 `product_code` 与 Idempotency-Key，缺失 verified mapping 时返回 `CHECKOUT_UNAVAILABLE`；GET 仅返回自身状态，永不返回 token/Secret；webhook 验签后同事务写 Inbox+Job，重复事件按 hash 幂等 ACK；maintenance 通过 job_executor claim/finish。
- 并发/失败边界：Inbox 使用唯一键加 `ON CONFLICT DO NOTHING` 后锁定既有事件，避免重复回调竞态；processing job 使用 `FOR UPDATE SKIP LOCKED`、60秒 lease 和递增 fence；旧 fence、异 payload duplicate 和直接表 DML 均有拒绝测试；真实 Provider 查询、订单事实验证、权益结算仍不在本阶段。
- 验证命令：`pnpm exec supabase db reset --local --yes` PASS；`pnpm test:db` PASS（31 files/579 tests）；`pnpm exec deno test --allow-env supabase/functions/account-api/index.test.ts` PASS（22 tests）；`pnpm exec deno test --allow-env supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts` PASS（10 tests）；`pnpm --filter account-server test` PASS；`pnpm --filter domain test` PASS；`pnpm --filter admin typecheck` PASS；`pnpm contracts:check` PASS（account=21/admin=38）；`pnpm docs:check` PASS（44 documents）；`git diff --check` PASS。
- Supabase lint：`pnpm exec supabase db lint --local --fail-on error` 未通过，但输出只有仓库既有 `admin_account_*`、`admin_file_policy_update`、`admin_deletion_job_*` 等函数的既有 error/warning；BILL-04 新增函数未出现 lint error。全量 format/lint 的既有失败不改写为 PASS。
- 覆盖范围：本地空库迁移、pgTAP、Deno/Node API 与 job 测试、SDK/domain/admin 类型、OpenAPI、文档和差异检查；未覆盖真实 Provider、真实付款、Provider 权威订单验证、自动结算、生产迁移、调度观察和生产恢复。
- 代码commit：`7169183`（`feat(billing): add checkout inbox and processing foundations`）与 `c3b99b3`（`fix(billing): harden webhook and worker fences`）；均已 push 到 `origin/codex/billing-architecture-review`，远端最终 SHA 为 `c3b99b3`。
- 未完成/阻塞/下一满足依赖任务：保持真实购买关闭；下一项为 BILL-05，完成 Provider 权威验证、双进度对账和共享 `entitlement_apply` 结算入口。

### BILL-05/2026-09-11/当前 Agent

- 实际变更文件：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql`、`supabase/tests/bill_05_provider_verification_settlement.sql`、`supabase/functions/_shared/afdian.ts`、`supabase/functions/_shared/afdian.test.ts`、`supabase/functions/maintenance/index.ts`、`supabase/functions/maintenance/index.test.ts` 及对应架构/合同/Proposal 文档。
- 实现行为：Afdian 观察先归一化为 Provider-neutral facts；SQL 锁定 Checkout/Order 后校验商品、期限、金额、币种、SKU、归属和生命周期；一次原结算使用共享 `entitlement_apply`，重复付款/合同冲突/既有真永久进入可审计人工路径；discovery/processing 游标分离并用版本 CAS；Provider 网络调用位于事务外。
- 验证命令：`pnpm exec supabase db reset --local --yes` PASS；`pnpm test:db` PASS（32 files/618 tests）；`pnpm exec deno test --allow-env supabase/functions/_shared/afdian.test.ts` PASS（2 tests）；`pnpm exec deno test --allow-env supabase/functions/maintenance/index.test.ts` PASS（8 tests）；`git diff --check` PASS。
- Supabase lint：未通过，但仅保留仓库既有函数的 error/warning；BILL-05 新增函数无 lint error。真实 Provider、真实退款/结算、生产调度仍 NOT_RUN。
- 覆盖范围：本地迁移、SQL 负向/幂等/并发边界、Provider normalizer 和事务外 maintenance worker；未覆盖真实渠道签名/限流/分页合同。
- 代码commit：`d587ca4`（`feat(billing): add provider verification and settlement`）；已 push 到 `origin/codex/billing-architecture-review`，远端 SHA 已核对。
- 未完成/阻塞/下一满足依赖任务：进入 BILL-06，交付中央 Admin 结案、Consumer BFF 和服务端授权；G-PROVIDER/G-OPS 保持 NOT_RUN。

### BILL-06/2026-09-11/当前 Agent

- 实际变更文件：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`、`supabase/tests/bill_06_admin_billing_and_consumer_authorization.sql`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`packages/account-server/src/index.ts`、`packages/account-server/tests/authorization.test.ts`、`apps/admin/app/admin/billing/page.tsx`、`apps/admin/features/billing/central-billing-page.tsx`、`apps/template-preview/app/api/auth/*`、`apps/template-preview/app/api/protected/advanced-config/route.ts`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`apps/template-preview/app/login/page.tsx`、`apps/template-preview/app/subscription/page.tsx`、`docs/reference/contracts/admin.openapi.json` 及导航/配置。
- 实现行为：Admin 通过私有 wrapper 读取订单/Provider 映射/指标并以近期 MFA、`operation_id`、`If-Match`、reason 触发重查/结案；直接 Billing 表 DML 保持拒绝，订单 admin_version 由触发器推进。Consumer Auth 使用同源 scoped cookies，login/refresh/logout 校验 Origin/CSRF 约束；BFF 只代理订阅白名单路径，服务端注入 Platform Key；页面从服务端商品和 Checkout 状态读取，不伪造支付成功；`authorizeProtectedFeature` 只使用中央 entitlement 结果，受保护示例不信任浏览器 plan 字段。
- 验证命令：`pnpm exec supabase db reset --local --yes` PASS；`pnpm test:db` PASS（33 files/648 tests）；Account API PASS（23 tests）；Afdian normalizer PASS（2 tests）；maintenance PASS（8 tests）；`@kit/account-server` typecheck/unit PASS（16 tests）；Template typecheck PASS；Template Auth 动态路由 production build PASS；Admin typecheck/build PASS（既有 account-auth/browser 导出 warning）；`pnpm lint` PASS；新增 Auth/受保护文件定向 `oxfmt --check` PASS；`pnpm contracts:check` PASS（account=21/admin=44）；`pnpm docs:check` PASS。
- Supabase lint：未通过，但仅保留仓库既有函数的 error/warning；BILL-06 新增函数无 lint error。真实 Consumer Auth、Provider、生产未运行。
- 代码commit：`b91800f`（`feat(billing): add central admin and consumer boundaries`）、`fa3083e`（`fix(billing): make admin resolution idempotent`）、`f1bfba1`（`feat(billing): expose admin resolution controls`）与 `d71a259`（`feat(consumer): add authenticated reference boundary`）；均已 push 到 `origin/codex/billing-architecture-review`，当前远端最终 SHA 为 `d71a259`。
- 未完成/阻塞/下一满足依赖任务：BILL-07 本地最终检查与文档同步；升级 fixture、真实 Provider/G-OPS 和生产观察保持 NOT_RUN。

### BILL-07/2026-09-11/当前 Agent

- 实际变更文件：`supabase/tests/bill_07_upgrade_compatibility.sql`、`supabase/functions/_shared/billing.ts`、`supabase/functions/account-api/index.ts`、`supabase/functions/billing-webhook/index.ts`、`supabase/functions/maintenance/index.ts` 及定向测试、`packages/domain/tests/billing.test.ts`、运行配置/Proposal 文档。
- 本地最终验证：`pnpm test:db` PASS（34 files/678 tests）；Account API PASS（25 tests）；Webhook PASS（4 tests）；maintenance PASS（9 tests）；Domain PASS（8 tests）；独立 stop switch 验证了 Checkout（含缺省关闭）、Webhook ingress、后台领取和自动结算的停机边界；`pnpm contracts:check`、`pnpm docs:check`、定向格式与 lint PASS。`pnpm exec supabase db lint --local --fail-on error` 仍因既有非 Billing 函数错误返回非零。
- 状态边界：G-DEV PASS；本地 G-OPS 证据 PARTIAL_LOCAL；真实生产等价数据、G-PROVIDER、真实调度/告警/密钥轮换、浏览器真实会话、真实付款、生产迁移/观察仍 NOT_RUN。整体 Proposal 仍为 In Progress，不能标记 Completed。
- 代码提交：`b7ec484`（`feat(billing): add upgrade fixture and stop controls`）与 `7b46695`（`fix(billing): fail closed for checkout issuance`），均已 push；文档同步随本记录提交。

## 5. 要求覆盖与实际测试

| 要求ID（总计划R01～R17） | 测试路径/用例 | 环境/被测commit | 命令/exit code | 结果/证据 |
|---|---|---|---|---|
| BILL-01 G-DEV | `packages/domain/tests/billing.test.ts`、`tests/spikes/billing/crypto-vectors.mjs` | 本地 Node/Deno；工作区当前改动 | `pnpm test:billing:crypto`; `pnpm test:billing:crypto:deno`; `pnpm --filter @kit/domain test:unit --run`; `pnpm --filter @kit/domain typecheck` | PASS；真实 Provider 仍 NOT_RUN |
| BILL-02 catalog/config | `supabase/tests/bill_02_subscription_product_catalog.sql`、`supabase/functions/account-api/index.test.ts`、`packages/account-server/tests/client.test.ts` | 本地 Docker DB、Deno、Node；当前工作区 | `pnpm test:db`; `pnpm exec deno test -A supabase/functions/account-api/index.test.ts`; `pnpm --filter @kit/account-server test:unit` | PASS；Provider/生产仍 NOT_RUN |
| BILL-03 redemption/correction | `supabase/tests/bill_03_redemption_v2_lifecycle.sql`、`packages/domain/tests/billing.test.ts`、`supabase/functions/account-api/index.test.ts` | 本地 Docker DB、Deno、Node；当前工作区 | `pnpm test:db`; `pnpm --filter @kit/domain test:unit --run`; `pnpm exec deno test -A supabase/functions/account-api/index.test.ts` | PASS；真实结算/生产仍 NOT_RUN |
| BILL-04 checkout/inbox/job | `supabase/tests/bill_04_checkout_order_inbox_jobs.sql`、`supabase/functions/billing-webhook/index.test.ts`、`supabase/functions/maintenance/index.test.ts`、Account API/SDK tests | 本地 Docker DB、Deno、Node；代码 commits `7169183` + `c3b99b3` | `pnpm exec supabase db reset --local --yes`; `pnpm test:db`; targeted Deno/SDK/domain/admin tests; `pnpm contracts:check`; `pnpm docs:check` | PASS（579 SQL assertions、22 Account、3 webhook、7 maintenance）；真实 Provider/结算/生产 NOT_RUN |
| BILL-05 verification/settlement | `supabase/tests/bill_05_provider_verification_settlement.sql`、Afdian normalizer、maintenance worker tests | 本地 Docker DB、Deno；代码 commit `d587ca4` | `pnpm test:db`; targeted Afdian/maintenance Deno tests; local Supabase lint | PASS（618 SQL assertions、2 Afdian、8 maintenance）；真实 Provider/生产 NOT_RUN |
| BILL-06 Admin/Consumer boundary | `supabase/tests/bill_06_admin_billing_and_consumer_authorization.sql`、Account API/SDK tests、Template/Admin build | 本地 Docker DB、Deno、Node、Next build；代码 commits `b91800f` + `fa3083e` | `pnpm test:db`; Account API/Afdian/maintenance; account-server unit/typecheck; Template/Admin typecheck/build; `pnpm contracts:check`; `pnpm docs:check` | PASS（648 SQL assertions、23 Account、2 Afdian、8 maintenance、16 SDK）；真实 Consumer/Provider/生产 NOT_RUN |
| BILL-07 final/local docs | 本记录、架构/合同/运维文档 | 本地工作区；代码 `b7ec484` | `pnpm exec supabase db reset --local --yes`; `pnpm test:db`; targeted regression; `pnpm contracts:check`; `pnpm docs:check` | Local G-DEV PASS；升级兼容 fixture/stop switch PASS；真实生产升级、G-PROVIDER/G-OPS/生产 NOT_RUN |

重点独立记录：Checkout长幂等/响应丢失、两笔真实款、finalized重放、ACK后崩溃、lease/fence、分页移动与处理重试、99年顺延/到期/跨世纪日期、Admin真永久兼容及通用替代链、删除/归档/批次并发、服务端故障授权。

## 6. 迁移与保留

- 旧Plan/Grant/Event/Batch/Code 的等价迁移 fixture、V1/V2 批次共存、旧HMAC及16–128长度边界：本地已由 `supabase/tests/bill_07_upgrade_compatibility.sql` 与 Domain 测试验证；真实数据分布仍未验证。
- FK/锁顺序/匿名保留/保留期/责任人/清理checkpoint决策：未冻结。
- CLI命令与迁移文件、升级fixture/空库reset：未执行。
- 普通7天幂等清理与长期绑定、删除后迟到通知：未验证。
- correction链及退款目标、任务/结算/删除竞态：未验证。
- schema兼容窗口、forward-fix/恢复演练：未验证。

## 7. 调度与上线准备

- 调用方/认证/频率/批量/超时/限流预算：未确定。
- 报警阈值/接收责任人/oldest_pending目标：未确定。
- 新购买/入站/结算/后台领取独立开关：本地已验证；生产配置变更、调度责任人、限流预算和告警仍未验证。
- 调度停机恢复/密钥轮换/积压与重复结算演练：未验证。
- G-PROVIDER/G-OPS通过和真实购买启用授权：未记录。

## 8. 最终结论与交接

实现覆盖：BILL-01～BILL-07 的本地 G-DEV 范围已完成；`docs:check` 与 `contracts:check` 均已 PASS；真实渠道、G-OPS 与生产观察：NOT_RUN。Proposal Completed：否，必须取得独立 G-PROVIDER/G-OPS 证据并获部署授权后才能继续发布门槛。

记录当时未提交修改归属、需用户决策事项、已解决与剩余失败；不得将本地模拟成功转换为真实支付可用。
