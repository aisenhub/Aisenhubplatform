# RC-01：状态、关系与公共合同修复设计

## 1. 阶段名称和状态

状态：执行中；TASK-0101、TASK-0103 已完成本地实现与回归，TASK-0102 已完成平台/身份门闩局部 forward-fix 与 Local 回归，完整锁表仍按依赖计划执行。当前派发以 TASK ID 为准，文件名为历史兼容路径。旧BILL记录只通过末尾归档链接引用，不是当前验收状态或执行授权。

## 2. 阶段目标

- 定义八类状态、事实/投影和错误合同（TASK-0101）。
- 冻结唯一写入口、锁顺序与生命周期前置（TASK-0102）。
- 建立数据库到Registry的消费者兼容清单（TASK-0103）。

## 3. 问题来源

[唯一问题表](../repair-issues.md)：F01,F03,F04,F05,F07,F08,F09,F10,F11,F12,F15,F16；[总计划](../plan.md)与[矩阵](../repair-matrices.md)。不在本阶段重复维护问题状态。

## 4. 前置依赖

TASK-0001；涉及业务政策的部分等待TASK-0003。每个任务的前置比阶段概述更精确。依赖未过只做可独立准备；阶段集成验收必须前置全部满足。默认串行；计划不授权多Agent。

## 5. 明确不在本阶段处理的内容

不重建支付业务，不新增组织、多Provider、OAuth或自动退款渠道。本轮只改proposal，不修改任何业务源码、迁移、配置、API、UI、测试，不commit/push。后续实现须另获任务派发。

## 6. 当前源码和配置证据

| 问题 | 基线证据 | 当前行为 |
| --- | --- | --- |
| F01 | `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:128,155; supabase/functions/_shared/afdian.ts:403,435` | v_valid 可为 NULL；NOT NULL 判断未 fail-closed；上轮虚构 paid 缺 plan 得到 granted/granted/finalized、1 Grant |
| F03 | `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365` | 已有任意 Settlement 提前返回；上轮 paid 后 failed 仍 paid/granted；refund_confirmed 仅本地结案 |
| F04 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:198,202; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:150,207; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:331` | Order 可未归属，Settlement 平台/账户 NOT NULL；上轮插入异常回滚；空平台 Admin scope 也须联查 |
| F05 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264` | 上轮 blocked/review_required 对应 Checkout pending；只成功路径写 granted；到期未形成完整状态 |
| F07 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:411; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:126; supabase/migrations/20260912150000_afdian_checkout_payment_link.sql:29` | 上轮将 mapping 从9.90改8.00不升版，8.00事实获 Grant，Checkout仍9.90；高权限配置触发 |
| F08 | `supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48` | 上轮 disabled 平台可授予；paused 下新增 Grant但subscription仍suspended；Plan读取锁和时间基准需统一 |
| F09 | `apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181` | 每次点击新UUID；成功响应后才持久化；取消仅清本地；Lifetime guard 与旧续购计划冲突，未完整分类异常 |
| F10 | `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187` | 实际函数名 admin_billing_order_requery/resolve；上轮resolve原样重放precondition_failed；重查未完整校验同操作参数 |
| F11 | `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560` | 首批50无完整UI翻页；created_at游标缺id；pending/retryable与Job筛选不一致 |
| F12 | `supabase/functions/_shared/afdian.ts:358,365,378,441,452; packages/domain/src/contracts/billing.ts:98` | quantity固定1、SQL只收sku_ids；未知状态failed；数字金额toFixed；无独立退款事实 |
| F15 | `apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613` | 永久文案vs99年；只消费创建响应子集；同商品禁购；独立fetch未统一刷新；SDK目录方法无用户态输入 |
| F16 | `packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101` | 文档26载荷/AISEN前缀与实际31默认不同；Unicode空白规范化不同；未找到窗口限流调用；交付/过期/禁用需保留负向验收 |

## 7. 修改文件清单

下列为未来实施候选，历史迁移只读；本轮仅该阶段计划文件发生文档改动。

- `docs/proposals/subscription-billing-centralization/design.md`
- `docs/proposals/subscription-billing-centralization/repair-matrices.md`
- `supabase/functions/account-api/index.ts`
- `packages/domain/src/contracts/billing.ts`
- `packages/domain/src/contracts/api.ts`
- `packages/domain/src/contracts/errors.ts`
- `docs/reference/contracts/account.openapi.json`
- `docs/reference/contracts/admin.openapi.json`
- `packages/account-server/src/index.ts`
- `apps/template-preview/app/api/v1/[...path]/route.ts`
- `apps/admin/app/api/v1/[...path]/route.ts`
- `registry/manifest.json`
- `registry/templates.json`
- `packages/account-auth/src/index.ts`

## 8. 数据库迁移清单

| 任务 | 迁移需求 | 生成/依赖/升级约束 |
| --- | --- | --- |
| TASK-0101 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0102 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0103 | 无 | 不改数据库；若需求变化先修计划。 |

所有迁移先核对 `pnpm exec supabase --version`、`pnpm exec supabase migration new --help`，再用 `pnpm exec supabase migration new <已审核slug>`。尖括号为占位不可原样执行；本轮不运行生成命令，不手造时间戳。确认前置迁移已应用、旧函数最后定义、依赖视图/触发器、DDL锁时间、回填批量/检查点和权限负例。远程schema变更需实际授权；不使用linked reset。迁移实际文件清单在执行时追加verification-record，不以候选slug计已生成。

## 9. API/OpenAPI/DTO/SDK 影响

逐任务列出的合同文件必须与[影响矩阵](../repair-matrices.md)一起验收。新增字段采用兼容扩展；不得静默更名现有跨模块字段，`/v1/plans`不改义。没有独立Admin SDK包，使用现有Admin请求封装与中央API DTO。函数名称和最新重定义在实施前重新rg，不能照抄上轮概述中的简称。

## 10. Consumer/Admin UI 影响

- TASK-0101：Consumer—明确pending/paid/verified/granted/active/retryable/manual_review/failed展示，active不是强塞Checkout枚举；Admin—未关联列表允许审查但不得自助认领。
- TASK-0102：Consumer—中央不可用时拒绝受保护动作；Admin—SQL可信上下文不能来自浏览器指定账户。
- TASK-0103：Consumer—用户态商品资格和订阅页一致；Admin—Admin使用现有adminAuthSession/资源封装，不新增重复HTTP栈。

## 11. 详细执行步骤

执行每个已派发任务：基线和前置→保留失败用例→最小领域/合同改动→同步消费者→定向验证→记录失败恢复和交接。以下清单不自动授权连续执行整个阶段。

<a id="task-0101"></a>
### TASK-0101：定义八类状态、事实/投影和错误合同

- 目标：产出字段级对照和兼容窗口；现有接口保留、只做有版本的扩展；没有第二套前端状态真源。
- 问题证据：F01：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:128,155; supabase/functions/_shared/afdian.ts:403,435`；F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`；F04：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:198,202; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:150,207; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:331`；F05：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264`；F10：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187`；F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`；F12：`supabase/functions/_shared/afdian.ts:358,365,378,441,452; packages/domain/src/contracts/billing.ts:98`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F01,F03,F04,F05,F10,F11,F12；结算/Provider、Order/Settlement/退款、归属/人工复核、Checkout/Consumer、Admin幂等、Admin检索、Provider合同。
- 前置依赖：TASK-0001。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`docs/proposals/subscription-billing-centralization`、`supabase/functions/account-api`、`packages/domain/src/contracts`、`docs/reference/contracts`、`packages/account-server/src`、`apps/template-preview/app/api/v1/[...path]`、`apps/admin/app/api/v1/[...path]`。
- 变更文件：`docs/proposals/subscription-billing-centralization/design.md`、`docs/proposals/subscription-billing-centralization/repair-matrices.md`、`supabase/functions/account-api/index.ts`、`packages/domain/src/contracts/billing.ts`、`packages/domain/src/contracts/api.ts`、`packages/domain/src/contracts/errors.ts`、`docs/reference/contracts/account.openapi.json`、`docs/reference/contracts/admin.openapi.json`、`packages/account-server/src/index.ts`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`apps/admin/app/api/v1/[...path]/route.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 枚举Checkout/Order/Inbox/Job/Settlement/Subscription/Grant/Code真实状态和合法转换。
    2. 定义payment observation、处理状态、权益授予及当前生效的独立字段，未知值不等于failed。
    3. 定义未关联处理、复合游标、202查询位置、错误码、If-Match与幂等冲突，逐个映射生产者消费者。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0101-NEG`；逐状态缺字段/未知枚举/已付降expired/202冒充完成的contract负例。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0101-REC`；定义迟到观察不覆盖已确认归属，最终结案与新补偿操作分离。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：明确pending/paid/verified/granted/active/retryable/manual_review/failed展示，active不是强塞Checkout枚举。
- 管理员操作验收：未关联列表允许审查但不得自助认领。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`

- 预期结果：产出字段级对照和兼容窗口；现有接口保留、只做有版本的扩展；没有第二套前端状态真源。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：本地实现完成；实施测试状态PASS（Provider/Staging/生产门槛仍NOT_RUN，见verification-record）。

<a id="task-0102"></a>
### TASK-0102：冻结唯一写入口、锁顺序与生命周期前置

- 目标：提供每个写入口前置和锁表；无死锁靠重试掩盖或HTTP重复算法。
- 问题证据：F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`；F07：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:411; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:126; supabase/migrations/20260912150000_afdian_checkout_payment_link.sql:29`；F08：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48`；F16：`packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F03,F07,F08,F16；Order/Settlement/退款、Catalog/Snapshot、权益/生命周期、兑换码。
- 前置依赖：TASK-0001；具体政策依赖TASK-0003。D3影响的生命周期政策需确认
- 变更目录：`docs/proposals/subscription-billing-centralization`、`supabase/migrations`、`supabase/tests`。
- 变更文件：`docs/proposals/subscription-billing-centralization/design.md`、`docs/proposals/subscription-billing-centralization/repair-matrices.md`、`supabase/migrations/20260914090949_repair_task_0102_platform_lifecycle.sql`、`supabase/tests/repair_task_0102_platform_lifecycle.sql`。
- 是否涉及数据库迁移：是；使用固定 Supabase CLI 2.111.0 生成 forward-fix，不修改已应用旧迁移；完整锁表仍需补依赖和回退/消费者方案。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 追踪最新entitlement_apply/recompute、兑换与Admin correction、删除/保留过程。
    2. 列出identity/platform/account/plan/batch/code/checkout/order/job锁获取与反向路径，记录冲突。
    3. 冻结只在领域过程写权益/配额/兑换/结算，外部网络在事务外，暂停/关闭/删除回执为显式结果。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0102-NEG`；跨平台FK、任意executor DML、旧Session/旧fence及删除后复活负例。已新增禁用平台授予负例：旧实现 5/5 FAIL（写入 1 Grant/1 Event），forward-fix 后 PASS；新增 deleting identity 负例：旧实现 4/4 FAIL（写入 1 Grant/1 Event），forward-fix 后 PASS；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0102-REC`；统一锁后时间点；Plan下架/批次禁用/暂停/删除与授予的串行解释。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：中央不可用时拒绝受保护动作。
- 管理员操作验收：SQL可信上下文不能来自浏览器指定账户。
- 验收命令：本轮已运行 `pnpm db:reset -- --yes`、`pnpm test:db`；其余双连接并发、Hosted/Staging、Admin E2E 仍是后续验收，不以旧套件单独代替。环境守卫与类别见第13节。

- `pnpm docs:check`
- `pnpm contracts:check`
- `pnpm db:reset -- --yes`
- `pnpm test:db`
- `git diff --check`

- 预期结果：提供每个写入口前置和锁表；无死锁靠重试掩盖或HTTP重复算法。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：局部完成（共享授予入口的平台禁用与 Global Delete identity barrier fail-closed，Local 回归 PASS）；完整任务仍阻塞（D3 其余生命周期策略、batch/code/checkout/order/job 全锁表、双连接并发、Hosted/Staging/Admin E2E 未验证）。

<a id="task-0103"></a>
### TASK-0103：建立数据库到Registry的消费者兼容清单

- 目标：所有变更字段有生产者/每个消费者/测试负责人；不虚构独立Admin SDK包，复用现有封装。
- 问题证据：F05：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264`；F10：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187`；F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`；F12：`supabase/functions/_shared/afdian.ts:358,365,378,441,452; packages/domain/src/contracts/billing.ts:98`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`；F16：`packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101`；F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。本任务已补充静态消费者索引、DTO负向校验、Account API fail-closed 回归及真实 SDK/BFF/类型检查。
- 影响范围：F05,F10,F11,F12,F15,F16,F17；Checkout/Consumer、Admin幂等、Admin检索、Provider合同、Consumer/SDK、兑换码、环境/CI/备份/文档。
- 前置依赖：TASK-0101。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/account-api`、`packages/domain/src/contracts`、`packages/domain/tests`、`packages/account-server/tests`、`docs/reference`、`tooling/scripts`、`apps/template-preview`、`registry`。
- 变更文件：`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`packages/domain/src/contracts/api.ts`、`packages/domain/src/contracts/index.ts`、`packages/domain/tests/billing.test.ts`、`packages/account-server/tests/authorization.test.ts`、`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/package.json`、`pnpm-lock.yaml`、`docs/reference/contracts.md`、`docs/reference/contract-consumer-matrix.md`、`docs/reference/contract-consumers.json`、`tooling/scripts/src/contract-consumer-check.mjs`、`package.json`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 以 `docs/reference/contract-consumers.json` 建立 DB→Edge→OpenAPI→DTO→SDK→BFF→UI→Registry→测试责任映射，并由 `contracts:check` 校验引用。
    2. Domain 以共享 `isSubscriptionProductDto`/`isSubscriptionProductList` 校验商品金额、币种、期限、版本和原因；Account API 遇到异常商品行返回 503，不降级为伪造 Free/0.00 数据。
    3. Consumer 页面复用 Domain DTO，保留服务端价格/期限/购买原因和 checkout 状态；同源 BFF、Platform Key、no-store、现有 `adminAuthSession` 边界不变。
    4. 采用 expand-first：不删除 `/v1` 字段；旧持久化 checkout 只读取受支持状态；真实 Provider、版本混跑、Consumer/Admin E2E 留待授权环境验证。
- 必须保留或新增的失败测试：`TASK-0103-NEG` 已覆盖 DTO 金额/期限/列表结构负例；Account API 另覆盖异常商品行 fail-closed，现有 Account SDK/BFF 保留 no-store、鉴权和跨资源错误边界回归。
- 并发/重试/恢复测试：`TASK-0103-REC` 由 Account SDK 商品读取路径和 checkout 合同测试负责；本任务未新增真实双连接版本混跑探针，Provider/Staging/Production 仍 NOT_RUN。
- 用户体验验收：用户态商品资格和订阅页一致。
- 管理员操作验收：Admin使用现有adminAuthSession/资源封装，不新增重复HTTP栈。
- 验收命令：以下命令已在本地运行；真实 Provider、Staging、Production、Consumer/Admin 浏览器 E2E 仍按第13节单独记录。

- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`

- 预期结果：所有清单字段均有生产者、每个声明消费者和测试负责人；不新增独立 Admin SDK，复用现有 `adminAuthSession`。本地静态、类型、SDK、Account API 和 Domain 回归 PASS；真实版本混跑、Provider、Staging、Production、浏览器可访问性为 NOT_RUN。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：本地实现及回归完成；实施测试状态 PASS（外部/真实浏览器门槛 NOT_RUN）。

## 12. 失败恢复和回滚策略

每TASK可作为独立实施单元；阶段集成需全部门槛。应用可按任务回退，数据迁移只提供兼容停止点和forward-fix，不能承诺财务账本可逆。暂停新购买不删除旧付款链接的后续事实；旧Worker/旧通知必须被fence/幂等隔离。外部操作成功但内部未知时先查询原交易/对象，不能盲重做。环境或策略未明确则BLOCKED，不用宽权限/删测试/吞异常继续。

## 13. 测试矩阵

下表全为计划；每次执行写环境、HEAD、命令、用例ID、退出码、断言、脱敏证据和清理残留。只有PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED五种测试值，范围另列。

| 类别 | 本阶段要求 | 计划结果 |
| --- | --- | --- |
| 静态检查 | docs/contracts/diff；实施后按文件lint/typecheck；不可替代运行验证 | PARTIAL（TASK-0101/0103 PASS；其余任务未执行） |
| 单元测试 | 每TASK-NEG/REC；金额、状态、SDK重放和规范化；无代码任务只做计划结构检查 | PARTIAL（TASK-0103 Domain/SDK PASS） |
| SQL/RLS/权限 | 领域结果、关系、owner/search_path和各executor负例；SQL任务不得只断言函数存在 | NOT_RUN |
| API合同测试 | 真实HTTP方法/路径/状态/body/headers/归属；OpenAPI静态通过另记 | PARTIAL（Account API/SDK本地回归 PASS；真实HTTP环境未运行） |
| 并发测试 | 按任务用例至少双连接/双会话；断言最终Order/Grant/Job/Audit | NOT_RUN |
| Webhook重放测试 | 同字节/异hash/未签字段及ACK前后故障；非入站任务验证消费者不误读 | NOT_RUN |
| Provider测试 | 模拟合同与真实Provider分别记录；真实调用需环境与授权 | NOT_RUN |
| Consumer E2E | 真实本地BFF→API→DB及UI；模拟Provider明确标注 | NOT_RUN |
| Admin E2E | 权限/MFA/202/If-Match/重放/证据时间线；非UI阶段待集成 | NOT_RUN |
| UI可访问性和响应式 | 窄屏、键盘、焦点、读屏、loading/error；后端阶段保留到UI集成 | NOT_RUN |
| 本地验证 | 只操作已确认localhost隔离fixture；不复用连接staging的既有浏览器会话 | PARTIAL（已执行 TASK-0101/0103 范围） |
| staging验证 | 需单独授权；支付/租约/权限/网关相关必须实测；纯准备任务只出清单 | NOT_RUN |
| 生产验证 | 另授权部署/真实付款/观察；不得由本地或历史Staging结果替代 | NOT_RUN |

验收命令目录见[矩阵](../repair-matrices.md)。TASK-0101/0103 已按实际命令记录结果；未获派发或缺少外部授权的任务仍保持 NOT_RUN/BLOCKED。不存在的用例/runner先实现并登记后运行；`pnpm test:api`为占位，不能计通过。

## 14. 验收条件

- [x] TASK-0101：产出字段级对照和兼容窗口；现有接口保留、只做有版本的扩展；没有第二套前端状态真源。
- [ ] TASK-0102：提供每个写入口前置和锁表；无死锁靠重试掩盖或HTTP重复算法。
- [x] TASK-0103：所有变更字段有生产者/每个消费者/测试负责人；不虚构独立Admin SDK包，复用现有封装。
- [ ] 前置未过不标完成；每项结果覆盖成功、失败、并发和恢复，不只HTTP200。
- [ ] 无已知P1在本阶段边界被隐藏；无放宽权限、删除测试或交易数据。
- [ ] SQL/API/SDK/BFF/UI/Registry相关消费者同步，兼容与回退实际验证。

## 15. 交接给下一阶段的输出

每任务提交给下一任务：具体文件diff、迁移实际顺序、合同版本/兼容窗口、前后失败证据、最后权威状态、风险/未验证项、回退停止点。参考[全局任务依赖表](../repair-matrices.md)。本轮禁止提交与推送；后续是否提交按届时用户授权，不能从历史附录继承。

## 16. 未完成事项和 NOT_RUN 项

TASK-0101、TASK-0103 已完成本地实现及回归；TASK-0102 和真实 Provider 合同、D1/D2/D3、告警责任/阈值、外部备份目标、staging/生产授权仍按任务标注。文档静态通过不把本阶段或生产标验收通过；版本混跑、Consumer/Admin 浏览器 E2E、Provider/Staging/Production 仍需单独授权和证据。

历史阶段保留在[归档文件](../../../archive/subscription-billing-centralization/phases/01-global-catalog-and-contract-foundation.md)；只作来源，状态和派发规则不作为本次修复验收。
