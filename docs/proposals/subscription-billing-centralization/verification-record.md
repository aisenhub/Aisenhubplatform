# 实施与验证记录

> BILL-01～BILL-07 已记录本地 G-DEV 结果；最终本地 forward-fix 已补齐商品映射就绪状态、普通幂等缓存清理和 Consumer 账户/文件真实链路，真实 Provider、Hosted 后端、运维和生产证据仍保持独立状态。

## 1. 执行基线

- 架构：[唯一设计](AisenFlow_Subscription_Billing_Architecture.md)；本轮实现代码 commits：`d587ca4`, `b91800f`, `fa3083e`, `f1bfba1`, `d71a259`, `b7ec484`, `7b46695`, `e7da954`, `14c9359`, `4d92db0`, `1edf844`, `fab5b3d`, `0378d3f`, `34f498c`。
- 计划：[总计划](00-master-plan.md)；本轮实现代码 commits：`d587ca4`, `b91800f`, `fa3083e`, `f1bfba1`, `d71a259`, `b7ec484`, `7b46695`, `e7da954`, `14c9359`, `4d92db0`, `1edf844`, `fab5b3d`, `0378d3f`, `34f498c`。
- 工作目录/branch/功能实现基线/remote：`E:\Projects\Aisenhubplatform` / `codex/billing-architecture-review` / 代码 `fab5b3d`、T12 探针修复与 fixture 清理 `0378d3f`/`34f498c` / `origin=https://github.com/aisenhub/Aisenhubplatform.git`；Registry 对齐、商品就绪、维护清理、Consumer 集成、SDK 可复现打包和 Admin 浏览器探针稳定性修复均已形成独立提交并核对远端。
- Node `v24.19.0`、pnpm `11.18.0`、Supabase CLI `2.111.0`、Deno `2.9.6`；Local DB reset、Docker 数据库和迁移测试已验证；调度与生产观察未验证。
- 基线：`pnpm docs:check` PASS；`pnpm contracts:check` PASS；`pnpm runtime:probe` PASS；`pnpm typecheck` PASS；全仓 `pnpm format:check` FAIL（59个文件，11个本轮变更源文件已定向 oxfmt PASS）；`pnpm lint` PASS；`pnpm test:api` 未运行且为占位入口。
- 当前用户实际派发阶段与授权范围：按 proposal 完成 BILL-01～BILL-07，并补齐本地验证发现的 Registry、商品就绪、幂等清理和 Consumer 集成 forward-fix；当前仅本地合同、数据库、API、SDK、Consumer/Admin 参考应用实现，不含真实付款、Provider/Webhook 配置、生产迁移或部署。
- 历史研究d3c25e9不是执行起点；本轮文档修订不作为任何功能验证。

## 2. 阶段状态

| 阶段 | 状态 | 实现/剩余 | commit/push |
|---|---|---|---|
| BILL-01 | G-DEV 已完成 | Provider-neutral 合同、虚构适配器夹具、Node/Deno MD5/HMAC 向量已验证；G-PROVIDER 未运行 | `20a28ed` / `4abb87b`，已 push |
| BILL-02 | 本地验收已交付 | 固定商品目录、期限语义、平台商品配置、切换 preflight、Account API/SDK/OpenAPI/Admin UI 已实现；Provider 映射未配置，真实购买关闭 | `503f14c` / `fdd106f`，已 push |
| BILL-03 | 本地验收已交付 | Redemption V2 快照、历史兼容、统一码规范化、Admin correction 预览/原子替代链、Admin/API 接入和 correction replay forward-fix 已实现；真实结算未运行 | `5dba4bd` + `764f76c` + `a170d52`，已 push |
| BILL-04 | 本地验收已交付 | 服务端定价Checkout snapshot、Order/Settlement关系、hash-only Webhook Inbox、持久 processing job、lease/fence、Account API/SDK/OpenAPI 和 maintenance 入口已实现；真实 Provider/权威结算未运行 | `7169183` + `c3b99b3`，已 push |
| BILL-05 | 本地验收已交付 | Provider-neutral 事实归一化、权威验证/结算、重复款/合同冲突、双进度游标、maintenance Provider I/O 边界已实现；真实 Provider 未运行 | `d587ca4`，已 push |
| BILL-06 | 本地验收已交付 | 中央 Billing Admin wrapper/UI、operation_id/If-Match/MFA 结案边界、Consumer Auth/BFF、账户/文件/订阅页面、近期认证和服务端权益授权已实现；结案 operation 使用已有 admin_idempotency 结果存储；Admin UI 已暴露重查和三种受控结案动作；本地双来源浏览器 E2E 已通过，Hosted/生产未运行 | `b91800f` + `fa3083e` + `f1bfba1` + `d71a259` + `1edf844` + `fab5b3d`，均已 push 并核对远端 |
| BILL-07 | 本地最终检查已完成 | Local reset、全量 SQL/API/SDK/前端/合同/文档回归完成；升级兼容 fixture、独立 stop switch 演练、Checkout fail-closed 及最终 forward-fix 回归已完成；真实生产等价升级数据、G-PROVIDER、G-OPS、生产观察未运行 | `b7ec484` + `7b46695` + `e7da954` + `14c9359` + `4d92db0` + `764f76c`，均已 push；文档同步随本记录提交 |

状态可用未开始/进行中/已阻塞/验证失败/验收通过待推送/已交付。已交付仅指该阶段明确范围，真实渠道和运维门槛另列；整体未满足不能Completed。

## 3. 门槛与协议证据

| 门槛 | 状态 | 证据/缺口 |
|---|---|---|
| G-DEV | PASS | `packages/domain/src/contracts/billing.ts` 冻结四商品期限、金额字符串、Checkout snapshot、Provider snapshot、操作来源/版本和结算状态；BILL-02 增加固定商品目录/配置与合同；BILL-03 增加 Redemption V2 snapshot、码规范化和 correction 链；BILL-04 增加 Checkout/Order/Inbox/Job schema、Account checkout DTO/SDK、hash-only webhook 和 lease/fence maintenance；BILL-05 增加 Provider-neutral 归一化、验证/结算、游标和 worker；BILL-06 增加中央 Billing Admin、Consumer Auth/BFF、服务端授权和动态订阅页；Node/Deno/SQL/前端固定测试通过 |
| G-PROVIDER | NOT_RUN | 真实渠道未验证 |
| G-OPS | PARTIAL_LOCAL | 本地 stop switch、停机不写库/不查 Provider、停机后积压保持并可在重启后重新领取、lease 可恢复路径已由 maintenance/webhook/API fixture 验证；真实调度密钥、限流预算、告警责任人与恢复演练仍未运行 |

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

### BILL-03 correction forward-fix/2026-09-12/当前 Agent

- 实际变更文件：`supabase/migrations/20260911221011_bill_03_correction_replay_idempotency.sql`、`tests/spikes/sql/m3-entitlement-ledger.mjs`；并修正 `supabase/tests/bill_07_upgrade_compatibility.sql` 将 V1 计数限定在 fixture platform，消除跨测试数据造成的顺序依赖。
- 实现行为：Admin correction 在持有平台/账户/订阅锁后先按 `platform_id + operation_id` 检查已提交结果，再检查原始事件序列；因此首次原子 revoke+grant 推进序列后，携带旧快照序列的重试仍返回 `replayed`。operation 对应账户/原 Grant 不一致时拒绝为 `idempotency_conflict`，不放宽替代链唯一性或共享权益写入口。
- 验证命令：`pnpm exec supabase db reset --local --yes` PASS；Local M3 entitlement ledger 脚本 PASS（correction preview、atomic replacement、replay、stale precondition、single replacement、concurrent winner/loser）；`pnpm test:db` PASS（36 files/695 tests）；定向 `oxfmt --check` 与 `git diff --check` PASS。
- 证据边界：以上为本地 Docker/Auth fixture 与 SQL 事务并发证据；真实退款/Provider、Hosted、生产调度、密钥轮换和删除竞态仍未验证，Proposal 仍不可标记 Completed。
- 后续测试提交：`a170d52` 增加同一 correction `operation_id` 跨账户重放的 `idempotency_conflict` 负向回归，已 push 并核对远端。

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
- 本地最终验证基线：`pnpm test:db` PASS（34 files/678 tests）；Account API PASS（25 tests）；Webhook PASS（4 tests）；maintenance PASS（9 tests）；Domain PASS（8 tests）；独立 stop switch 验证了 Checkout（含缺省关闭）、Webhook ingress、后台领取和自动结算的停机边界；`pnpm contracts:check`、`pnpm docs:check`、定向格式与 lint PASS。`pnpm exec supabase db lint --local --fail-on error` 仍因既有非 Billing 函数错误返回非零。
- 状态边界：G-DEV PASS；本地 G-OPS 证据 PARTIAL_LOCAL；真实生产等价数据、G-PROVIDER、真实调度/告警/密钥轮换、真实付款、生产迁移/观察仍 NOT_RUN。`pnpm test:e2e:t12-r2` 已通过 Admin AAL1/AAL2、近期认证 proof、敏感写入、退出后旧 JWT 拒绝及 70 条路由×5 视口可访问性矩阵；`pnpm test:e2e:t16-r2` 继续通过独立上下文、平台隔离、订阅/文件、账户、Admin、跨 Tab、未知响应和 bundle 凭据扫描。整体 Proposal 仍为 In Progress，不能标记 Completed。
- 代码提交：`b7ec484`（`feat(billing): add upgrade fixture and stop controls`）与 `7b46695`（`fix(billing): fail closed for checkout issuance`），均已 push；Registry/商品/维护 forward-fix 分别为 `e7da954`、`14c9359`、`4d92db0`，均已 push。

### 最终本地 forward-fix/2026-09-12/当前 Agent

- 实际变更文件：`supabase/migrations/20260911161052_bill_08_purchase_readiness.sql`、`supabase/tests/bill_08_purchase_readiness.sql`、`supabase/migrations/20260911161726_bill_09_idempotency_cleanup.sql`、`supabase/tests/bill_09_idempotency_cleanup.sql`、`packages/domain/src/contracts/api.ts`、`docs/reference/contracts/account.openapi.json`、`supabase/functions/maintenance/index.ts`、`supabase/functions/maintenance/index.test.ts`、`supabase/functions/maintenance/schedule.json`、Registry/E2E 对齐文件及相关参考文档。
- 实现行为：公开商品目录的 `purchasable` 仅在平台/Plan/产品开关和当前 Provider mapping 同时满足时为 true，并以 `ready` 明确就绪原因；新增受 `job_executor` 保护的有界 `private.idempotency_cleanup`，每日入口只清理过期普通幂等缓存，不删除 Checkout/Order 长期绑定；Registry 只登记当前真实存在的页面与 `/api/auth/callback`，本地 E2E 启动变量与当前模板 `TEMPLATE_ORIGIN` 对齐。
- 验证命令：`pnpm exec supabase db reset --local --yes` PASS；`pnpm test:db` PASS（36 files/693 tests）；Account API PASS（25 tests）；maintenance PASS（10 tests）；`pnpm contracts:check` PASS；`pnpm docs:check` PASS；Registry M5-04 PASS；`pnpm lint` PASS；针对变更文件的 `oxfmt --check` 与 `git diff --check` PASS；完整 `pnpm typecheck` PASS。`pnpm exec supabase db lint --local --fail-on error` 仍只报告仓库既有非 Billing 函数错误/警告；全仓 format 基线仍有既有失败。
- 覆盖范围：Local 空库迁移、pgTAP、Account/maintenance 单测、公共合同、Registry 静态一致性、Consumer 本地双来源浏览器链路和文档；未覆盖真实 Provider、真实支付、Hosted 后端、生产调度/告警、生产迁移和生产观察。

### Consumer 集成修复/2026-09-12/当前 Agent

- 实际变更文件：`apps/template-preview/app/api/v1/[...path]/route.ts`、`apps/template-preview/app/api/auth/reauth/*`、`apps/template-preview/app/account/page.tsx`、`apps/template-preview/app/files/page.tsx`、`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/components/consumer-auth-actions.tsx`、`apps/template-preview/components/consumer-shell.tsx`、`packages/account-auth-nextjs/src/browser.ts`、`apps/admin/next.config.mjs`、`tests/spikes/e2e/t16-r2-account.mjs`。
- 实现行为：修复 catch-all BFF 的 `v1` 路径拼接；扩大严格 allowlist 覆盖账户资料/偏好、文件读写、敏感账户动作；账户页使用中央 API 的 ETag/CSRF/错误合同，近期认证使用独立 start/verify 路由和 HttpOnly proof cookie；文件页连接真实列表、上传、下载和删除；会话跨页刷新/退出/跨 tab 失效具有确定反馈；Admin 构建可正确解析浏览器会话导出。
- 验证命令：`pnpm test:sdk:m5-02` PASS（可复现 tarball、包边界、独立安装、Node/Edge 导入和浏览器导入拒绝）；`pnpm test:consumer:m5-05` PASS（独立安装、类型检查、生产构建、模板路由、local dual-origin platform E2E）；`pnpm test:e2e:t12-r2` PASS（Admin AAL1/AAL2、近期认证 proof、敏感写入、退出后旧 JWT 拒绝、70 条路由×5 视口可访问性）；`pnpm test:e2e:t16-r2` PASS（独立上下文、平台 Key 隔离、订阅/兑换、文件、资料/偏好、CSRF/ETag、Admin MFA/暂停恢复、跨 Tab、敏感操作未知响应和 bundle 凭据）；`pnpm test:ops:m6-02-local` PASS（外部备份目标为 `NOT_RUN (X04 unavailable)`）；`pnpm --filter template-preview typecheck` PASS；Impeccable detector PASS（无告警）。Hosted 双平台结果为 `NOT_RUN`（staging 根站点可达，但当前无认证 fixture/runner），不转换为本地 PASS。
- 代码提交：`1edf844`（`fix(consumer): complete account and file integration`）、`fab5b3d`（`fix(sdk): make package archives reproducible`）、`0378d3f`（`test(admin): stabilize browser probe hydration`）与 `34f498c`（`test(admin): clean subscription fixtures`），均已 push 并核对远端 SHA；验证记录随独立文档提交同步。

### Staging 可达性复核/2026-09-12/当前 Agent

- 只读探针结果：`STAGING_ACCOUNT_ORIGIN` 与 `STAGING_ADMIN_ORIGIN` 根站点均返回 HTTP 200；未携带认证或平台密钥访问受保护页面/Account API 时返回 HTTP 401/404。探针未输出或保存任何 URL 值、Token、Key，也未对 staging 数据执行写入。
- 结论：staging 主机并非网络不可达，但只读 REST schema 虽包含当前公开 Billing 表，计数为 1 个平台、0 个 Plan、0 个账户/订阅/兑换码/文件，且平台 API key 不在公开 schema；当前工作区仍缺少可复用的认证 Hosted 双平台 fixture/runner，故 X05 仍为 `NOT_RUN`。该探针不能替代 Consumer 双平台、平台隔离、文件/订阅/账户/Admin 全链路验收；未获得明确 staging fixture 授权前不创建或修改外部数据。

### Admin 交互语义修复/2026-09-12/当前 Agent

- 实际变更文件：`apps/admin/app/layout.tsx` 及 8 个 Admin 页面/组件中的 Button-Link 组合。
- 实现行为：所有以 `Link` 作为渲染目标的 `Button` 显式关闭原生 button 语义推断，保留链接的可访问性与键盘行为；根布局显式声明全局平滑滚动，消除 Next.js 路由过渡提示。
- 验证命令：`pnpm test:e2e:t12-r2` PASS（Admin 登录、AAL1/AAL2、近期认证 proof、敏感写入、退出后旧 JWT 拒绝、70 条路由×5 视口；测试用户/平台/配置清理为 0）；`pnpm exec oxfmt --check`（9 个变更文件）PASS；`pnpm --filter admin typecheck` PASS；`pnpm lint` PASS；`git diff --check` PASS；测试进程清理核对 PASS。
- 代码提交：`7e318a3`（`fix(admin): preserve link button semantics`）已 push，并核对 `origin/codex/billing-architecture-review` 远端 SHA 为 `7e318a38c5f5dffcfbc302c05331218a92082c10`。

### Local R15 授权压力探针/2026-09-12/当前 Agent

- 实际变更文件：`supabase/migrations/20260911211649_account_api_principal_presented_fast_path.sql`、`supabase/tests/t13_platform_key_principal.sql`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`tests/spikes/perf/r15-local-authority.mjs`、`package.json`、`docs/reference/configuration.md`。
- 代码提交：`ba053a4`（`perf(account-api): coalesce auth verification work`；已与本条验证记录一起 push）。
- 本轮追加代码提交：`8ef9596`（`perf(account-api): collapse principal authorization lookup`；包含 SQL fast path、权限断言、可自启动压力探针和当前版本复测结果）。
- 本轮追加代码提交：`9f778bd`（`perf(account-api): support startup executor roles`；startup 角色模式仅作为显式 Local/运维调优项验证，默认保持事务角色模式）。
- 实现行为：同一 access token 的并发 Auth 验证只共享进行中的请求，验证完成立即移除，不缓存验证结果；普通认证 Account API 路径通过 `private.account_principal_presented` 在一次数据库调用内完成呈现 Key、会话和平台账户授权，公开资源与近期认证证明仍保留原有 Key 验证边界。每个业务请求仍执行数据库 session、平台 Key 与权限检查。平台 HMAC CryptoKey 在进程内复用；数据库连接池上限新增受限配置 `ACCOUNT_API_DB_POOL_MAX`（4–64，默认 8），未改变默认值；`ACCOUNT_API_DB_ROLE_MODE=startup` 可让独立连接池在连接建立时固定 executor 角色，默认仍为 `transaction`，需单独确认连接用户允许 `SET ROLE`。压力探针支持 `R15_START_API=1` 自行启动并清理 Local Account API。
- 验证结果：Account API Deno 测试 `27 passed`；完整 Local DB reset 后 `pnpm test:db` PASS（36 files/695 tests），含新增函数存在性、SECURITY DEFINER、search_path 和最小权限断言；10 req/s 短 smoke 为 20/20、错误率 0%、p95 225.82ms。当前单次授权路径、默认事务角色模式/连接池 8 下自包含执行 100 req/s×60s 为 6000/6000、错误率 0%、实际 97.61 req/s、p95 760.70ms；此前无单次路径的同窗口基线为 p95 820.58ms。启用 startup 角色模式、连接池 8 后同窗口为 6000/6000、错误率 0%、实际 100.03 req/s、p95 619.00ms、p99 785.61ms，仍未达到 p95≤500ms；15 分钟完整窗口未伪造为通过。
- 负载对照：同一 startup + pool8 配置在 50 req/s×60s 为 3000/3000、错误率 0%、实际 50.16 req/s、p95 332.50ms、p99 425.62ms，满足该负载下的 p95≤500ms 门槛；这不能替代 100 req/s 目标，当前证据显示 Local 在两档负载之间发生延迟饱和。
- 证据边界：startup 角色模式仅在 Local 经过验证，未改变默认配置；连接池 4 + startup 角色的 60 秒对照 p95 969.24ms，连接池 12 + startup 角色的对照 p95 1601.58ms、实际 77.03 req/s，连接池 32 的历史对照 p95 1455.32ms，均不作为推荐配置。当前 Local 最优测得组合为 startup + pool8；结果不转换为 G-OPS 或生产通过。
- 结论（远程 Auth 验证基线）：功能授权链路 PASS；该基线的 R15 性能目标为 `NOT_PASS/待容量优化`，失败结果保留并由后续本地 JWT/JWKS 优化复测；探针只操作 Local fixture，未修改 staging/生产。

### Local G-OPS 停机恢复回归/2026-09-12/当前 Agent

- 实际变更文件：`supabase/functions/maintenance/index.test.ts`。
- 验证结果：新增用例覆盖后台处理开关关闭时不领取积压任务、积压保持可见、开关恢复后重新领取并按 fence 完成；Webhook/maintenance 定向测试 `15 passed`，定向 `oxfmt --check` 与 `git diff --check` PASS。
- 证据边界：这是本地 handler/数据库边界模拟，不代表真实 scheduler、Provider 限流、密钥托管/轮换、告警或生产恢复已经通过；这些仍保持 G-OPS/生产 NOT_RUN。

### Local BILL-05 结算并发回归/2026-09-12/当前 Agent

- 实际变更文件：`tests/spikes/sql/bill-05-settlement-concurrency.mjs`、`package.json`。
- 验证命令：`pnpm run test:sql:bill-05-concurrency` 在 Local Auth/Kong 恢复后连续运行 2 次均 PASS；两个不同 Provider 订单并发竞争同一 Checkout，结果恰为 `granted` + `duplicate_payment`，settlement 为 automatic 1 + manual 1，Grant 为 1，job 为 completed 1 + manual_review 1。
- 清理验证：探针逐项清理 Provider、订单、任务、Grant/Event、订阅和平台夹具；复测后残留计数为 `platforms=0, jobs=0, providers=0`。完整 `pnpm test:db` 随后 PASS（36 files/695 tests）。
- 证据边界：这是本地事务锁、自动结算唯一槽位和人工复核边界的并发证据；Provider 真实签名/query-order、真实付款/退款、外部调度和生产观察仍保持 G-PROVIDER/G-OPS/生产 NOT_RUN。
- 代码与验证提交：`9e066b0`（`test(billing): cover concurrent settlement slot`）已 push，并核对 `origin/codex/billing-architecture-review` 远端 SHA。

### Local R15 JWT 验证优化/2026-09-12/当前 Agent

- 实际变更文件：`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`tests/spikes/perf/r15-local-authority.mjs`、`docs/reference/configuration.md`。
- 实现行为：Account API 支持 HS256 可选 Secret 和 Supabase Auth ES256 JWKS 的本地签名校验；JWKS 公钥仅短期缓存，验证结果不缓存，每个业务请求仍进入 `account_principal_presented` 检查活动 session/revocation。JWKS 不可用时回退 Auth `/user`，不改变 fail-closed 语义。
- 验证命令：Account API Deno 测试 `29 passed`；startup role + pool8、`100 req/s × 60s` 为 `6000/6000`、错误率 `0`、实际 `100.66 req/s`、p95 `289.87ms`、p99 `376.69ms`，R15 探针 `pass=true`；此前同口径优化路径复测为 p95 `379.65ms` 和 `301.85ms`，均通过门槛；定向 `oxfmt --check`、`pnpm lint`、`pnpm contracts:check`、`pnpm docs:check` 与 `git diff --check` PASS。
- 对照与边界：此前同一 startup + pool8、远程 Auth 验证路径 p95 `619.00ms` 的失败结果保留；本次仅操作 Local fixture，未把本地性能结果外推为 Hosted/生产容量或 G-OPS 通过。
- 代码提交：`4eebbbd`（`perf(account-api): verify access tokens locally`）已 push，并核对 `origin/codex/billing-architecture-review` 远端 SHA。

## 5. 要求覆盖与实际测试

### R01–R17 逐项证据映射

| 要求 | Local 证据 | 当前结论与剩余边界 |
|---|---|---|
| R01 中央自营/BFF 边界 | `tests/spikes/consumer/m5-05-install.mjs`、`tests/spikes/e2e/t16-r2-account.mjs` 的独立平台与 bundle 凭据扫描；Consumer BFF allowlist | Local PASS；Hosted 双平台仍 NOT_RUN（staging 根站点可达但无认证 runner） |
| R02 目录与 Free 单源 | `supabase/tests/bill_02_subscription_product_catalog.sql`、`bill_08_purchase_readiness.sql`、Account API 商品测试 | Local PASS；真实 Provider 映射未联调 |
| R03 Provider 权威 | `supabase/tests/bill_05_provider_verification_settlement.sql`、`supabase/functions/_shared/afdian.test.ts`、crypto vectors | G-DEV/模拟 PASS；G-PROVIDER 真实签名、query-order、限流仍 NOT_RUN |
| R04 调价与版本发布 | BILL-02 catalog/config、BILL-04 checkout snapshot、Account checkout API 测试 | Local PASS；真实渠道旧链接结算未验证 |
| R05 Checkout 恢复 | `supabase/tests/bill_04_checkout_order_inbox_jobs.sql`、`bill_09_idempotency_cleanup.sql`、checkout API 测试 | Local PASS；生产恢复观察未运行 |
| R06 结算与租户隔离 | BILL-04/BILL-05 SQL、BILL-06 SQL、Account API 平台/账户负向测试 | Local PASS；真实订单事实未验证 |
| R07 Inbox/任务恢复 | `supabase/functions/billing-webhook/index.test.ts`、`maintenance/index.test.ts`、BILL-04 SQL lease/fence 用例 | Local PASS；真实调度接管未验证 |
| R08 优惠/数量/金额合同 | BILL-05 SQL、`packages/domain/tests/billing.test.ts`、Afdian normalizer tests | Local PASS；真实 discount/redeem/零元行为 NOT_RUN |
| R09 99 年与通用修正 | BILL-03/BILL-05/BILL-06 SQL、Domain calendar/correction tests、T16 Admin flow | Local PASS；真实退款/撤销定位未验证 |
| R10 旧码兼容 | `supabase/tests/bill_03_redemption_v2_lifecycle.sql`、`bill_07_upgrade_compatibility.sql`、Domain redemption tests | Local PASS；真实生产数据分布未验证 |
| R11 SDK 状态与页面 | `tests/spikes/sdk/m5-02-packages.mjs`、`consumer/m5-05-install.mjs`、T16/T12 浏览器流程 | Local PASS；Hosted/生产页面观察未运行（staging 根站点可达但无认证 runner） |
| R12 Admin 结案边界 | BILL-06 SQL、`packages/account-server/tests/authorization.test.ts`、T12 MFA/AAL2 与 T16 Admin flow | Local PASS；真实运维责任/生产审计未验证 |
| R13 双进度对账 | BILL-05 SQL、`maintenance/index.test.ts`、Admin operations UI | Local 模拟 PASS；Provider 分页/限流和生产告警仍 NOT_RUN |
| R14 生命周期与删除 | BILL-03/BILL-04/BILL-07 SQL、M4 retention/delete tests、T16 close/delete flow | Local PASS；真实恢复点与生产保留观察未运行 |
| R15 服务端授权 | `packages/account-server/tests/authorization.test.ts`、BILL-06 SQL、T16 suspended/expired/central failure matrix、`tests/spikes/perf/r15-local-authority.mjs` | Local 功能与优化后压力授权 PASS；startup 角色模式 + pool8、100 req/s×60s 为 6000/6000、错误率 0、p95 289.87ms；Hosted/生产延迟与可用性未验证 |
| R16 最小权限与旧写路径退出 | `supabase/tests/t10_role_negative.sql`、BILL-04/BILL-06 SQL、maintenance role tests | Local PASS；生产角色/密钥轮换未验证 |
| R17 上线与恢复 | BILL-07 upgrade/stop-switch、`tests/spikes/ops/m6-02-local-backup.mjs`、Local E2E、R15 补充压力探针 | Local PARTIAL_LOCAL；R15 优化后本地压力门槛通过；G-PROVIDER、G-OPS、外部备份、生产迁移/观察仍 NOT_RUN |

| 要求ID（总计划R01～R17） | 测试路径/用例 | 环境/被测commit | 命令/exit code | 结果/证据 |
|---|---|---|---|---|
| BILL-01 G-DEV | `packages/domain/tests/billing.test.ts`、`tests/spikes/billing/crypto-vectors.mjs` | 本地 Node/Deno；工作区当前改动 | `pnpm test:billing:crypto`; `pnpm test:billing:crypto:deno`; `pnpm --filter @kit/domain test:unit --run`; `pnpm --filter @kit/domain typecheck` | PASS；真实 Provider 仍 NOT_RUN |
| BILL-02 catalog/config | `supabase/tests/bill_02_subscription_product_catalog.sql`、`supabase/functions/account-api/index.test.ts`、`packages/account-server/tests/client.test.ts` | 本地 Docker DB、Deno、Node；当前工作区 | `pnpm test:db`; `pnpm exec deno test -A supabase/functions/account-api/index.test.ts`; `pnpm --filter @kit/account-server test:unit` | PASS；Provider/生产仍 NOT_RUN |
| BILL-03 redemption/correction | `supabase/tests/bill_03_redemption_v2_lifecycle.sql`、`packages/domain/tests/billing.test.ts`、`supabase/functions/account-api/index.test.ts` | 本地 Docker DB、Deno、Node；当前工作区 | `pnpm test:db`; `pnpm --filter @kit/domain test:unit --run`; `pnpm exec deno test -A supabase/functions/account-api/index.test.ts` | PASS；真实结算/生产仍 NOT_RUN |
| BILL-04 checkout/inbox/job | `supabase/tests/bill_04_checkout_order_inbox_jobs.sql`、`supabase/functions/billing-webhook/index.test.ts`、`supabase/functions/maintenance/index.test.ts`、Account API/SDK tests | 本地 Docker DB、Deno、Node；代码 commits `7169183` + `c3b99b3` | `pnpm exec supabase db reset --local --yes`; `pnpm test:db`; targeted Deno/SDK/domain/admin tests; `pnpm contracts:check`; `pnpm docs:check` | PASS（579 SQL assertions、22 Account、3 webhook、7 maintenance）；真实 Provider/结算/生产 NOT_RUN |
| BILL-05 verification/settlement | `supabase/tests/bill_05_provider_verification_settlement.sql`、`tests/spikes/sql/bill-05-settlement-concurrency.mjs`、Afdian normalizer、maintenance worker tests | 本地 Docker DB、Deno、Node；本轮工作区 | `pnpm test:db`; `pnpm run test:sql:bill-05-concurrency`; targeted Afdian/maintenance Deno tests; local Supabase lint | Local PASS（完整 36 files/695 tests；并发结算 2 次连续 PASS，automatic/manual=1/1，Grant=1）；真实 Provider/生产 NOT_RUN |
| BILL-06 Admin/Consumer boundary | `supabase/tests/bill_06_admin_billing_and_consumer_authorization.sql`、Account API/SDK tests、Template/Admin build、`tests/spikes/e2e/t16-r2-account.mjs` | 本地 Docker DB、Deno、Node、Next build；代码 commits `b91800f` + `fa3083e` + `1edf844` + `fab5b3d` | `pnpm test:db`; Account API/Afdian/maintenance; account-server unit/typecheck; Template/Admin typecheck/build; `pnpm test:sdk:m5-02`; `pnpm test:consumer:m5-05`; `pnpm contracts:check`; `pnpm docs:check` | PASS（648 SQL assertions、23 Account、2 Afdian、8 maintenance、SDK 可复现归档/独立安装、Consumer 独立安装/类型/构建/模板路由/local dual-origin E2E）；Hosted/Provider/生产 NOT_RUN |
| BILL-07 final/local docs | 本记录、架构/合同/运维文档 | 本地工作区；代码 `b7ec484` 及后续 forward-fix、Consumer 集成 `1edf844` | `pnpm exec supabase db reset --local --yes`; `pnpm test:db`; targeted regression; `pnpm test:consumer:m5-05`; `pnpm test:e2e:t16-r2`; `pnpm test:ops:m6-02-local`; `pnpm contracts:check`; `pnpm docs:check` | Local G-DEV PASS；升级兼容 fixture/stop switch/商品就绪/幂等清理/Consumer 本地双来源 E2E/完整 T16 R2/本地备份 barrier 演练 PASS；Hosted 后端、外部备份目标、真实生产升级、G-PROVIDER/G-OPS/生产 NOT_RUN |

重点独立记录：Checkout长幂等/响应丢失、两笔真实款、finalized重放、ACK后崩溃、lease/fence、分页移动与处理重试、99年顺延/到期/跨世纪日期、Admin真永久兼容及通用替代链、删除/归档/批次并发、服务端故障授权。

## 6. 迁移与保留

- 旧Plan/Grant/Event/Batch/Code 的等价迁移 fixture、V1/V2 批次共存、旧HMAC及16–128长度边界：本地已由 `supabase/tests/bill_07_upgrade_compatibility.sql` 与 Domain 测试验证；真实数据分布仍未验证。
- FK/锁顺序/匿名保留/保留期/责任人/清理checkpoint决策：未冻结。
- CLI `supabase migration new` 命令、升级fixture与空库 reset 已在本地执行；BILL-08/BILL-09 迁移已保留，生产等价升级迁移/恢复仍未执行。
- 普通7天幂等清理与长期绑定：Local 已通过 BILL-09 wrapper/入口 fixture 验证；删除后迟到通知、生产清理调度与告警仍未验证。
- correction链及退款目标、任务/结算/删除竞态：未验证。
- schema兼容窗口、forward-fix/恢复演练：未验证。

## 7. 调度与上线准备

- 调用方/认证/频率/批量/超时/限流预算：未确定。
- 报警阈值/接收责任人/oldest_pending目标：未确定。
- 新购买/入站/结算/后台领取独立开关：本地已验证；幂等缓存清理每日调度入口已加入并通过 maintenance fixture；生产配置变更、调度责任人、限流预算和告警仍未验证。
- 调度停机恢复/密钥轮换/积压与重复结算演练：未验证。
- G-PROVIDER/G-OPS通过和真实购买启用授权：未记录。

## 8. 最终结论与交接

实现覆盖：BILL-01～BILL-07 的本地 G-DEV 范围、最终商品/幂等 forward-fix、Consumer 本地双来源链路，以及 BILL-10 价格发布、BILL-12 Afdian Checkout URL 与 Hosted Webhook 边界已完成；`docs:check` 与 `contracts:check` 均已 PASS；真实渠道、G-OPS 与生产观察仍 NOT_RUN。Proposal Completed：否，必须取得独立 G-PROVIDER/G-OPS 证据并获真实 Provider 配置后才能继续发布门槛。

记录当时未提交修改归属、需用户决策事项、已解决与剩余失败；不得将本地模拟成功转换为真实支付可用。

### Afdian transport 与价格发布/2026-09-12/当前 Agent

- 实际变更文件：`supabase/functions/_shared/afdian.ts`、`supabase/functions/_shared/afdian.test.ts`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`supabase/functions/billing-webhook/index.ts`、`supabase/functions/billing-webhook/index.test.ts`、`supabase/functions/maintenance/index.ts`、`supabase/migrations/20260912060342_bill_10_afdian_price_release.sql`、`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`、`supabase/migrations/20260912143000_hosted_runtime_role_membership.sql`、`supabase/migrations/20260912150000_afdian_checkout_payment_link.sql`、对应 SQL tests、`docs/reference/configuration.md`。
- 实现行为：加入 Afdian 官方 API MD5 canonical signing、`query-order` 适配、超时/失败分类、服务端环境变量装配；Webhook 支持官方 `data.type=order` envelope、稳定订单状态事件键、可选不可猜路径段和 `ec=200` ACK；不保存原始 webhook body，只写 hash 和 Inbox/Job 结果。新增价格 forward migration，将 monthly/yearly/lifetime 调整为 9.90/39.90/49.90 CNY 并将 price_version 提升至 2，保留 lifetime=99 years；已验证 mapping 时，Account API 服务端生成包含 plan/SKU/custom_order_id 的 Afdian URL，没有 mapping 时继续关闭购买。
- 验证命令：`pnpm test:db` PASS（39 files/717 tests）；Afdian Deno 定向测试 PASS（8 tests）；Account API/Webhook/Maintenance 定向测试此前 PASS；`pnpm lint` PASS；目标文件 `oxfmt --check` PASS；`pnpm run docs:check` PASS（44 documents）；`pnpm run contracts:check` PASS；`git diff --check` PASS。BILL-13 迁移已应用到 staging。
- 证据边界：staging 已写入用户提供的三个公开 Checkout 链接对应的商品映射；两档普通订阅为 `product_type=0` 且无 SKU，99 年商品为 `product_type=1` 且带一个 SKU。真实付款、Webhook 与 `query-order` 的订单字段回环、权益结算、Provider 限流、告警和生产 Secret 仍为 G-PROVIDER/G-OPS 待验证项。

### Hosted staging 数据库与 Webhook 边界/2026-09-12/当前 Agent

- staging 项目：Supabase `workendstaging`，仅操作项目 ref `egsokuicabbxspkdccqe`；已确认旧远端迁移链与仓库不一致，且业务订阅/授权/事件数据为空。按用户明确授权的 staging 无保留数据范围执行了 `supabase db reset --linked --yes`，生产未触碰。
- 已部署函数：`account-api`、`billing-webhook`、`maintenance`，三者均使用当前工作区代码；数据库迁移已覆盖 BILL-01～BILL-10。远端商品结果为 Free、Monthly `9.90 CNY`、Yearly `39.90 CNY`、Lifetime `49.90 CNY`，付费价格版本为 2，Lifetime 仍为有限 99 年。
- Hosted 修复：发现远端 `postgres` 不能进入 `billing_ingress` 等 executor role，新增 `20260912143000_hosted_runtime_role_membership.sql`；staging 已先行执行同等授权，迁移随后固化。该差异此前只会在 hosted Edge Function 中暴露，本地超级用户测试无法发现。
- Hosted 真实 HTTP 烟测：使用明确标记的 staging fixture provider account 和 fixture order，Afdian 官方 envelope POST 到 `/functions/v1/billing-webhook/webhooks/afdian` 返回 `200 {"ec":200,"em":"ok"}`；同一字节 payload 重放再次返回 200，数据库仅保留一个事件和一个处理 job。fixture 已清理，`BILLING_PROVIDER_ACCOUNT_ID` 测试 Secret 已移除。
- 当前未完成：staging 已注入新的 Afdian `user_id` 与 API Token，三个商品映射和服务端 Checkout 参数已配置，并已完成真实 API 请求路径的失败恢复烟测；真实付款、成功订单 `query-order`、Webhook 与 API 字段一致性、权益结算、外部调度器和生产观察仍未完成。已暴露的旧 Token 仍不得使用，必须继续通过 Secret 注入并按需轮换。

### Hosted staging Afdian 商品映射/2026-09-12/当前 Agent

- Monthly `9.90 CNY`：普通订阅，`product_type=0`，`purchase_months=1`，当前 mapping version 2；旧售卖商品映射已停用。
- Yearly `39.90 CNY`：普通订阅，`product_type=0`，`purchase_months=12`，当前 mapping version 2；旧售卖商品映射已停用。
- Lifetime `49.90 CNY`：售卖商品，`product_type=1`，SKU 集合为一个 SKU，期限由本地合同固定为有限 99 年，当前 mapping version 1。
- 所有当前映射均为 CNY、无优惠、已发布并启用；映射值来自用户提供的公开付款链接。它们仍需一笔真实 staging 付款来完成 Provider round-trip 验收。

### Consumer 模板付款入口/2026-09-12/当前 Agent

- `apps/template-preview` 的 `/subscription` 已作为可复用 Consumer 付款模板：商品目录与权益状态分开加载，方案卡通过同源 BFF 创建服务端绑定 Checkout，订单状态支持自动轮询和手动刷新；页面规则明确禁止直接使用没有 `custom_order_id` 的裸 Afdian 商品链接。
- 模板示例配置已补充 `aisentest` 的 `ACCOUNT_API_URL`/`ACCOUNT_PLATFORM_KEY` 约束；真实 Platform Key 只通过 Admin 创建、部署确认流程注入本地模板服务端环境。
- staging 已由用户提供一个已确认邮箱的 Auth 用户，并通过一次性的 staging 管理员引导登记写入 `private.system_admin`；`aisentest` 平台为 active，Platform Key 已由用户在 Admin 控制台完成创建与部署确认。该确认状态来自服务端持久化结果，不以浏览器弹窗是否自动关闭作为证据。
- 当前工作区已临时启动连接 staging 的本地 Admin 控制台 `http://localhost:3000/admin/login`；该入口只用于本次 staging 初始化，不代表已有托管 Admin 域名，也不包含任何真实密钥。

### Hosted staging 配置与 Consumer 付款入口复核/2026-09-13/当前 Agent

- staging 的 `aisentest` 平台默认免费 Plan、付费 Plan 与订阅配置已由 Admin 流程完成；月度、年度、永久三个商品均启用，价格分别为 `9.90`、`39.90`、`49.90 CNY`。
- `GET /v1/subscription/products` 通过本地 `template-preview` BFF 返回 HTTP 200；Monthly、Yearly、Lifetime 均为 `enabled=true`、`purchasable=true`、`reason=ready`。这只证明配置、Key 与 Provider mapping 可用，不代表真实付款已完成。
- `apps/template-preview` 已补齐 staging 公共 Auth 环境注入，并在 `/subscription` 增加首次登录后的“激活工作区”入口；模板服务端仍只使用本地忽略文件中的 Platform Key，未写入仓库。
- 首次点击月度方案时，服务端日志确认请求已到达，但返回 `503 CHECKOUT_UNAVAILABLE`；原因是 staging 的独立 `BILLING_CHECKOUT_ENABLED` 默认关闭。已仅对 staging 设置为 `true`，并在模板中补充“创建中…”状态与重复点击保护。
- 已通过模板类型检查、仓库 `pnpm lint`、`git diff --check`，并验证本地 `/login` 与 `/subscription` 可返回 HTTP 200。下一步仍需刷新模板、重新创建一笔月度订单并完成真实付款，之后才能验证 Afdian Webhook、`query-order` 权威核验和权益结算。

### Afdian 接入方式选型与 Webhook 签名/2026-09-12/当前 Agent

- 选型结论：采用 `Webhook + API`。Webhook 用于实时接收入站订单事件，API `query-order` 用于服务端权威核验、重试和补偿；两者共同完成 Provider round-trip。OAuth2.0 暂不接入，因为它需要向爱发电申请 `client_id/client_secret`，解决的是爱发电用户授权登录/身份绑定，不是收款回调或订单核验。
- 依据资料：`docs/aifadian/教程.html`、`docs/aifadian/教程2.html` 和 `docs/aifadian/data.md`。教程说明 Webhook 可能重复投递、API 使用 `user_id + token` 的 MD5 签名，且 2025-07 起 Webhook envelope 使用订单字段的 RSA/SHA-256 签名。
- 实现变更：`billing-webhook` 现在对标准 Afdian `data.type=order` envelope 校验 `data.sign`；签名字符串按 `out_trade_no + user_id + plan_id + total_amount` 拼接，使用 RSA PKCS#1 v1.5/SHA-256 验证。`AFDIAN_WEBHOOK_PATH_SECRET` 仍作为额外路径防护，API Token 仅由 maintenance 服务端读取。
- 验证：Afdian/作业 Webhook 定向测试 14/14 PASS，包含运行时生成 RSA fixture、签名篡改拒绝、回调 ACK 和路径密钥场景；真实 Afdian 签名/回调仍需 Provider staging 联调。
- 安全处理：`docs/aifadian/data.md` 中的 API Token 已脱敏；旧 Token 不得继续使用，需在爱发电后台重新生成并通过 Supabase staging Secret 注入。

### Hosted staging Afdian Provider 绑定/2026-09-12/当前 Agent

- 原因复现：配置 Provider account 前，Webhook 地址的 GET 探测返回 405；POST 请求返回 503 `WEBHOOK_NOT_CONFIGURED`。`AFDIAN_USER_ID` 与 `AFDIAN_API_TOKEN` 本身不能替代本系统内部的 Provider account 绑定。
- 已处理：在 staging 创建 active Afdian Provider account，绑定当前 Afdian creator `user_id`，并设置 `BILLING_PROVIDER_ACCOUNT_ID` Secret；未操作生产。
- 已验证：用户在爱发电后台发送测试后，Provider 回调已到达 staging，并由入口返回 `{"ec":200,"em":"ok"}`；随后已完成 Worker/API 查询失败恢复路径验证。当前商品映射已配置，待继续：真实付款与 API/回调 round-trip。

### Hosted staging Afdian 测试回调/2026-09-12/当前 Agent

- 用户点击爱发电后台“发送测试”后，staging 数据库在 `2026-09-12 10:13:34 UTC` 收到 1 条 Afdian Webhook Inbox 事件，并创建 1 个 `webhook_order_discovery` 处理任务。
- 事件状态为 `queued`，处理任务状态为 `pending`；这证明请求已通过标准 envelope 解析、RSA 签名校验、Provider 绑定校验并持久化。Afdian ACK 在持久化成功后返回 `200 {"ec":200,"em":"ok"}`；爱发电后台不显示可见反馈不等于回调失败。
- 当前未宣称真实订单已核验或结算：该测试事件尚未完成后台 job processing，且真实 plan/SKU mapping、真实付款和 API `query-order` round-trip 仍待 G-PROVIDER/G-OPS 验证。

### Hosted staging Billing Worker/2026-09-12/当前 Agent

- 修复发现链路：新增 `billing_webhook_discovery_target`、`billing_order_link_checkout` 和受 fencing 保护的事件状态推进；maintenance 增加 `/maintenance/v1/billing/jobs/discover` 与 `/maintenance/v1/billing/jobs/run`，调度入口默认每次顺序处理最多 5 个任务。BILL-11 的列名歧义通过 BILL-12 forward-fix 修复，未修改已应用迁移。
- staging 已配置专用 `MAINTENANCE_JOB_TOKEN` 与固定 `MAINTENANCE_WORKER_ID`，并重新部署 `maintenance`。Hosted run smoke test 返回 HTTP 200，处理 1 个 `webhook_order_discovery` 任务；API 查询结果为 `PROVIDER_ORDER_NOT_FOUND`，任务和 Webhook 事件均进入 `retryable`，证明 Token 注入、Worker fencing、Afdian API 请求和失败恢复路径已连通。
- 该结果仅说明爱发电后台测试信号可被系统接收并进入可恢复处理，不代表真实订单、商品映射、付款或权益结算成功。由于 staging Billing 表启用了受限 RLS，测试事件及占位订单未通过直接 DML 删除，而是经正式 Worker lease/finish 接口标记为 `manual_review`，避免继续重试并保留审计证据；真实调度器仍需由 G-OPS 受控配置，`schedule.json` 本身不安装定时器。
