# RC-08：全链路验收、迁移演练与发布门槛

## 1. 阶段名称和状态

状态：Proposed／计划中；本轮只制定计划，所有修复实现未开始。当前派发以 TASK ID 为准，文件名为历史兼容路径。旧BILL记录只通过末尾归档链接引用，不是当前验收状态或执行授权。

## 2. 阶段目标

- 把关键反例和完整链路纳入CI门槛（TASK-0801）。
- 执行生产等价升级与分阶段回退演练（TASK-0802）。
- 分层验收Staging Provider与真实支付开启门槛（TASK-0803）。
- 关闭问题并同步架构合同SDK文档与交接（TASK-0804）。

## 3. 问题来源

[唯一问题表](../repair-issues.md)：F01,F02,F03,F04,F05,F06,F07,F08,F09,F10,F11,F12,F13,F14,F15,F16,F17；[总计划](../plan.md)与[矩阵](../repair-matrices.md)。不在本阶段重复维护问题状态。

## 4. 前置依赖

RC-00–RC-07各任务输出；外部授权单列。每个任务的前置比阶段概述更精确。依赖未过只做可独立准备；阶段集成验收必须前置全部满足。默认串行；计划不授权多Agent。

## 5. 明确不在本阶段处理的内容

不自动部署/收费/提交/推送，不删除历史FAIL，不提前把目标写入architecture。本轮只改proposal，不修改任何业务源码、迁移、配置、API、UI、测试，不commit/push。后续实现须另获任务派发。

## 6. 当前源码和配置证据

| 问题 | 基线证据 | 当前行为 |
| --- | --- | --- |
| F01 | `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:128,155; supabase/functions/_shared/afdian.ts:403,435` | v_valid 可为 NULL；NOT NULL 判断未 fail-closed；上轮虚构 paid 缺 plan 得到 granted/granted/finalized、1 Grant |
| F02 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:532,562; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:59; supabase/functions/maintenance/index.ts:655,699` | claim 只 pending/retryable；lease deadline 未统一校验；上轮 expired processing reclaimed=0；重试固定一分钟无上限 |
| F03 | `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365` | 已有任意 Settlement 提前返回；上轮 paid 后 failed 仍 paid/granted；refund_confirmed 仅本地结案 |
| F04 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:198,202; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:150,207; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:331` | Order 可未归属，Settlement 平台/账户 NOT NULL；上轮插入异常回滚；空平台 Admin scope 也须联查 |
| F05 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264` | 上轮 blocked/review_required 对应 Checkout pending；只成功路径写 granted；到期未形成完整状态 |
| F06 | `supabase/functions/_shared/afdian.ts:255; supabase/functions/maintenance/index.ts:792; supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:457` | 当前 discovery 使用 Webhook 已知订单号；游标过程存在不等于有主动扫描调用方 |
| F07 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:411; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:126; supabase/migrations/20260912150000_afdian_checkout_payment_link.sql:29` | 上轮将 mapping 从9.90改8.00不升版，8.00事实获 Grant，Checkout仍9.90；高权限配置触发 |
| F08 | `supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48` | 上轮 disabled 平台可授予；paused 下新增 Grant但subscription仍suspended；Plan读取锁和时间基准需统一 |
| F09 | `apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181` | 每次点击新UUID；成功响应后才持久化；取消仅清本地；Lifetime guard 与旧续购计划冲突，未完整分类异常 |
| F10 | `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187` | 实际函数名 admin_billing_order_requery/resolve；上轮resolve原样重放precondition_failed；重查未完整校验同操作参数 |
| F11 | `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560` | 首批50无完整UI翻页；created_at游标缺id；pending/retryable与Job筛选不一致 |
| F12 | `supabase/functions/_shared/afdian.ts:358,365,378,441,452; packages/domain/src/contracts/billing.ts:98` | quantity固定1、SQL只收sku_ids；未知状态failed；数字金额toFixed；无独立退款事实 |
| F13 | `supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235` | RSA canonical不包含status但event key包含；同事件不同hash冲突；通用HMAC header绑定须检查 |
| F14 | `supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195` | Vault缺值直接return；不跟踪pg_net结果；5秒HTTP处理5个顺序任务；processing未完整统计；路径必须含maintenance函数前缀 |
| F15 | `apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613` | 永久文案vs99年；只消费创建响应子集；同商品禁购；独立fetch未统一刷新；SDK目录方法无用户态输入 |
| F16 | `packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101` | 文档26载荷/AISEN前缀与实际31默认不同；Unicode空白规范化不同；未找到窗口限流调用；交付/过期/禁用需保留负向验收 |
| F17 | `.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1` | CI非部署且缺完整SQL/Edge/E2E门槛；历史Local/Staging叙述冲突；外部对象备份/恢复未证实；格式等历史失败须保留 |

## 7. 修改文件清单

下列为未来实施候选，历史迁移只读；本轮仅该阶段计划文件发生文档改动。

- `.github/workflows/workflow.yml`
- `package.json`
- `tooling/scripts/src/supabase.mjs`
- `tests/spikes/e2e/t16-r2-account.mjs`
- `tests/spikes/e2e/t12-r2-admin.mjs`
- `tests/spikes/sql/bill-05-settlement-concurrency.mjs`
- `supabase/tests/bill_05_provider_verification_settlement.sql`
- `supabase/tests/bill_07_upgrade_compatibility.sql`
- `tests/spikes/ops/m6-02-local-backup.mjs`
- `docs/proposals/subscription-billing-centralization/verification-record.md`
- `docs/guides/operations.md`
- `docs/proposals/subscription-billing-centralization/repair-matrices.md`
- `docs/proposals/subscription-billing-centralization/repair-issues.md`
- `docs/proposals/subscription-billing-centralization/plan.md`
- `docs/architecture/overview.md`
- `docs/architecture/modules/entitlements.md`
- `docs/architecture/modules/frontends.md`
- `docs/architecture/modules/files-jobs.md`
- `docs/reference/api.md`
- `docs/reference/contracts.md`
- `docs/reference/sdk.md`
- `docs/reference/data-model.md`
- `docs/reference/configuration.md`
- `docs/guides/testing.md`
- `registry/README.md`

## 8. 数据库迁移清单

| 任务 | 迁移需求 | 生成/依赖/升级约束 |
| --- | --- | --- |
| TASK-0801 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0802 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0803 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0804 | 无 | 不改数据库；若需求变化先修计划。 |

所有迁移先核对 `pnpm exec supabase --version`、`pnpm exec supabase migration new --help`，再用 `pnpm exec supabase migration new <已审核slug>`。尖括号为占位不可原样执行；本轮不运行生成命令，不手造时间戳。确认前置迁移已应用、旧函数最后定义、依赖视图/触发器、DDL锁时间、回填批量/检查点和权限负例。远程schema变更需实际授权；不使用linked reset。迁移实际文件清单在执行时追加verification-record，不以候选slug计已生成。

## 9. API/OpenAPI/DTO/SDK 影响

逐任务列出的合同文件必须与[影响矩阵](../repair-matrices.md)一起验收。新增字段采用兼容扩展；不得静默更名现有跨模块字段，`/v1/plans`不改义。没有独立Admin SDK包，使用现有Admin请求封装与中央API DTO。函数名称和最新重定义在实施前重新rg，不能照抄上轮概述中的简称。

## 10. Consumer/Admin UI 影响

- TASK-0801：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0802：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0803：Consumer—端到端金额/状态/有效权益完全一致；Admin—所有异常可定位到负责人与操作记录。
- TASK-0804：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。

## 11. 详细执行步骤

执行每个已派发任务：基线和前置→保留失败用例→最小领域/合同改动→同步消费者→定向验证→记录失败恢复和交接。以下清单不自动授权连续执行整个阶段。

<a id="task-0801"></a>
### TASK-0801：把关键反例和完整链路纳入CI门槛

- 目标：每项问题有测试ID/断言/命令/环境/exit/evidence，不只函数存在性检查。
- 问题证据：F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F17；环境/CI/备份/文档。
- 前置依赖：各被测TASK实现完成。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`.github/workflows`、`.`、`tooling/scripts/src`、`tests/spikes/e2e`、`tests/spikes/sql`、`supabase/tests`。
- 变更文件：`.github/workflows/workflow.yml`、`package.json`、`tooling/scripts/src/supabase.mjs`、`tests/spikes/e2e/t16-r2-account.mjs`、`tests/spikes/e2e/t12-r2-admin.mjs`、`tests/spikes/sql/bill-05-settlement-concurrency.mjs`、`supabase/tests/bill_05_provider_verification_settlement.sql`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 将F01–F17对应负向与成功用例登记到可运行本地fixture，必要时新增runner并同步package后才调用。
    2. CI执行SQL/Edge/SDK/真实本地HTTP及两端E2E，安全扫描和环境拒绝门槛前置。
    3. 静态contract checker与运行时合同分开，保留旧FAIL和回归前后结果，CI不偷偷变部署任务。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0801-NEG`；CI跳过测试仍绿、占位test:api计PASS、fixture误连staging、缺测试自动pass。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0801-REC`；矩阵全部23场景真实双连接/进程故障按用例执行，环境不足标BLOCKED。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:sdk:m5-02`
- `pnpm runtime:probe`

- 预期结果：每项问题有测试ID/断言/命令/环境/exit/evidence，不只函数存在性检查。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0802"></a>
### TASK-0802：执行生产等价升级与分阶段回退演练

- 目标：每阶段有独立停止点及可恢复证据，不宣称账本可无损down。
- 问题证据：F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`；F07：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:411; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:126; supabase/migrations/20260912150000_afdian_checkout_payment_link.sql:29`；F08：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F17,F07,F08；环境/CI/备份/文档、Catalog/Snapshot、权益/生命周期。
- 前置依赖：TASK-0801,TASK-0706。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/tests`、`tests/spikes/ops`、`docs/proposals/subscription-billing-centralization`、`docs/guides`。
- 变更文件：`supabase/tests/bill_07_upgrade_compatibility.sql`、`tests/spikes/ops/m6-02-local-backup.mjs`、`docs/proposals/subscription-billing-centralization/verification-record.md`、`docs/guides/operations.md`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 构造脱敏旧版本数据而非只空库reset，按迁移清单顺序升级。
    2. 测旧SDK/旧BFF与扩展schema兼容、旧Checkout和旧码/HMAC、回滚旧应用后交易保留。
    3. 演练关闭新购买/回退安全应用/保留schema/forward-fix与积压重处理。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0802-NEG`；旧mapping不明被猜测回填、down migration删除Grant、回退重新开放NULL漏洞。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0802-REC`；升级时Job领取/已付款回调/恢复时旧fence、跨版本响应重放。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `pnpm test:maintenance`
- `pnpm test:ops:m6-02-local`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：每阶段有独立停止点及可恢复证据，不宣称账本可无损down。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0803"></a>
### TASK-0803：分层验收Staging Provider与真实支付开启门槛

- 目标：阻塞清单零未处置P1且门槛证据完整才可建议开启；未获授权保持NOT_RUN/BLOCKED。
- 问题证据：F01：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:128,155; supabase/functions/_shared/afdian.ts:403,435`；F02：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:532,562; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:59; supabase/functions/maintenance/index.ts:655,699`；F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`；F04：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:198,202; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:150,207; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:331`；F05：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264`；F06：`supabase/functions/_shared/afdian.ts:255; supabase/functions/maintenance/index.ts:792; supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:457`；F07：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:411; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:126; supabase/migrations/20260912150000_afdian_checkout_payment_link.sql:29`；F08：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48`；F09：`apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181`；F10：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187`；F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`；F12：`supabase/functions/_shared/afdian.ts:358,365,378,441,452; packages/domain/src/contracts/billing.ts:98`；F13：`supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235`；F14：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`；F16：`packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101`；F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F01,F02,F03,F04,F05,F06,F07,F08,F09,F10,F11,F12,F13,F14,F15,F16,F17；结算/Provider、Job/Worker、Order/Settlement/退款、归属/人工复核、Checkout/Consumer、对账、Catalog/Snapshot、权益/生命周期、Checkout幂等、Admin幂等、Admin检索、Provider合同、Webhook安全、cron/观测、Consumer/SDK、兑换码、环境/CI/备份/文档。
- 前置依赖：TASK-0801,TASK-0802；G-PROVIDER/G-OPS实际授权。远程/Provider/生产动作需要本次具体授权，不从旧Staging记录继承
- 变更目录：`docs/proposals/subscription-billing-centralization`。
- 变更文件：`docs/proposals/subscription-billing-centralization/verification-record.md`、`docs/proposals/subscription-billing-centralization/repair-matrices.md`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 核验授权环境/fixture/金额上限/清理范围再执行Staging月年99年合同和异常链，不沿用临时价或历史授权。
    2. 逐单核对Provider事实、Order、Settlement、Grant/Event、Job、审计及两端UI，覆盖无Webhook与退款。
    3. 独立签署G-DEV/G-PROVIDER/G-OPS/发布批准，生产部署/费用/真实付款另授权，生产观察有值班窗口和停止阈值。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0803-NEG`；真实签名不匹配、年度未验收、临时价未恢复、退款补偿缺失、告警未送达。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0803-REC`；真实/可控故障慢查询、重投、租约接管、补单与退款交错。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：端到端金额/状态/有效权益完全一致。
- 管理员操作验收：所有异常可定位到负责人与操作记录。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：阻塞清单零未处置P1且门槛证据完整才可建议开启；未获授权保持NOT_RUN/BLOCKED。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：阻塞（需所列决策/外部授权；独立准备可执行）；实施测试状态NOT_RUN。

<a id="task-0804"></a>
### TASK-0804：关闭问题并同步架构合同SDK文档与交接

- 目标：问题状态与证据一致；本地完成/渠道完成/生产观察独立，不自动提交推送。
- 问题证据：F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`；F16：`packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F17,F15,F16；环境/CI/备份/文档、Consumer/SDK、兑换码。
- 前置依赖：TASK-0801,TASK-0802；远程未完成项必须保留状态。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`docs/proposals/subscription-billing-centralization`、`docs/architecture`、`docs/architecture/modules`、`docs/reference`、`docs/guides`、`registry`。
- 变更文件：`docs/proposals/subscription-billing-centralization/repair-issues.md`、`docs/proposals/subscription-billing-centralization/plan.md`、`docs/proposals/subscription-billing-centralization/verification-record.md`、`docs/architecture/overview.md`、`docs/architecture/modules/entitlements.md`、`docs/architecture/modules/frontends.md`、`docs/architecture/modules/files-jobs.md`、`docs/reference/api.md`、`docs/reference/contracts.md`、`docs/reference/sdk.md`、`docs/reference/data-model.md`、`docs/reference/configuration.md`、`docs/guides/testing.md`、`docs/guides/operations.md`、`registry/README.md`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 逐F条核验源码与实际测试，不用计划替代完成证据。
    2. 已实现事实才同步architecture/reference/guides，修正码格式、重试、对账、Staging状态和旧续购冲突。
    3. 保留历史验证及失败、迁移SHA与授权记录，输出未完成门槛和下一可派发任务。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0804-NEG`；仍有反例却标Completed、历史PASS冒充本轮、NOT_RUN被汇总掩盖。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0804-REC`；恢复后核对关闭问题未复发，旧消费者兼容未丢。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：问题状态与证据一致；本地完成/渠道完成/生产观察独立，不自动提交推送。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

## 12. 失败恢复和回滚策略

每TASK可作为独立实施单元；阶段集成需全部门槛。应用可按任务回退，数据迁移只提供兼容停止点和forward-fix，不能承诺财务账本可逆。暂停新购买不删除旧付款链接的后续事实；旧Worker/旧通知必须被fence/幂等隔离。外部操作成功但内部未知时先查询原交易/对象，不能盲重做。环境或策略未明确则BLOCKED，不用宽权限/删测试/吞异常继续。

## 13. 测试矩阵

下表全为计划；每次执行写环境、HEAD、命令、用例ID、退出码、断言、脱敏证据和清理残留。只有PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED五种测试值，范围另列。

| 类别 | 本阶段要求 | 计划结果 |
| --- | --- | --- |
| 静态检查 | docs/contracts/diff；实施后按文件lint/typecheck；不可替代运行验证 | NOT_RUN |
| 单元测试 | 每TASK-NEG/REC；金额、状态、SDK重放和规范化；无代码任务只做计划结构检查 | NOT_RUN |
| SQL/RLS/权限 | 领域结果、关系、owner/search_path和各executor负例；SQL任务不得只断言函数存在 | NOT_RUN |
| API合同测试 | 真实HTTP方法/路径/状态/body/headers/归属；OpenAPI静态通过另记 | NOT_RUN |
| 并发测试 | 按任务用例至少双连接/双会话；断言最终Order/Grant/Job/Audit | NOT_RUN |
| Webhook重放测试 | 同字节/异hash/未签字段及ACK前后故障；非入站任务验证消费者不误读 | NOT_RUN |
| Provider测试 | 模拟合同与真实Provider分别记录；真实调用需环境与授权 | NOT_RUN |
| Consumer E2E | 真实本地BFF→API→DB及UI；模拟Provider明确标注 | NOT_RUN |
| Admin E2E | 权限/MFA/202/If-Match/重放/证据时间线；非UI阶段待集成 | NOT_RUN |
| UI可访问性和响应式 | 窄屏、键盘、焦点、读屏、loading/error；后端阶段保留到UI集成 | NOT_RUN |
| 本地验证 | 只操作已确认localhost隔离fixture；不复用连接staging的既有浏览器会话 | NOT_RUN |
| staging验证 | 需单独授权；支付/租约/权限/网关相关必须实测；纯准备任务只出清单 | NOT_RUN |
| 生产验证 | 另授权部署/真实付款/观察；不得由本地或历史Staging结果替代 | NOT_RUN |

验收命令目录见[矩阵](../repair-matrices.md)。本轮仅执行计划的docs/contracts/diff及结构核对；上述业务命令是未来任务要求。不存在的用例/runner先实现并登记后运行；`pnpm test:api`为占位，不能计通过。

## 14. 验收条件

- [ ] TASK-0801：每项问题有测试ID/断言/命令/环境/exit/evidence，不只函数存在性检查。
- [ ] TASK-0802：每阶段有独立停止点及可恢复证据，不宣称账本可无损down。
- [ ] TASK-0803：阻塞清单零未处置P1且门槛证据完整才可建议开启；未获授权保持NOT_RUN/BLOCKED。
- [ ] TASK-0804：问题状态与证据一致；本地完成/渠道完成/生产观察独立，不自动提交推送。
- [ ] 前置未过不标完成；每项结果覆盖成功、失败、并发和恢复，不只HTTP200。
- [ ] 无已知P1在本阶段边界被隐藏；无放宽权限、删除测试或交易数据。
- [ ] SQL/API/SDK/BFF/UI/Registry相关消费者同步，兼容与回退实际验证。

## 15. 交接给下一阶段的输出

每任务提交给下一任务：具体文件diff、迁移实际顺序、合同版本/兼容窗口、前后失败证据、最后权威状态、风险/未验证项、回退停止点。参考[全局任务依赖表](../repair-matrices.md)。本轮禁止提交与推送；后续是否提交按届时用户授权，不能从历史附录继承。

## 16. 未完成事项和 NOT_RUN 项

全部TASK尚未实施；所需真实Provider合同、D1/D2/D3、告警责任/阈值、外部备份目标、staging/生产授权按任务标注。文档静态通过不把本阶段标验收通过。修复后才将实际事实同步architecture/reference/guides，本轮只整理proposal。

历史阶段保留在[归档文件](../../../archive/subscription-billing-centralization/phases/07-final-verification-cleanup-and-doc-sync.md)；只作来源，状态和派发规则不作为本次修复验收。
