# RC-06：Admin订单、人工处理与审计体验

## 1. 阶段名称和状态

状态：In Progress；TASK-0601、TASK-0603、TASK-0605、TASK-0609 已完成本地实现或回归，TASK-0602 已完成本地权限与跨平台隔离回归及 forward-fix；TASK-0604、0606～0608、0610～0614 仍未开始或受前置策略/环境门槛影响。当前派发以 TASK ID 为准，文件名为历史兼容路径。旧BILL记录只通过末尾归档链接引用，不是当前验收状态或执行授权。

## 2. 阶段目标

- 实现订单列表服务端搜索筛选与复合游标（TASK-0601）。
- 验证平台范围、跨账户与中央管理员边界（TASK-0602）。
- 聚合订单详情和完整证据时间线（TASK-0603）。
- 让Provider重查成为可追踪异步操作（TASK-0604）。
- 展示Webhook与Job独立状态及租约诊断（TASK-0605）。
- 明确重试、重查、结案与人工复核可用动作（TASK-0606）。
- 关联订单的Grant撤销暂停恢复及修正（TASK-0607）。
- 展示金额币种Plan期限与权益影响预览（TASK-0608）。
- 修复operation_id重放顺序和If-Match并发（TASK-0609）。
- 执行AAL2近期MFA原因审计与风险确认（TASK-0610）。
- 将HTTP202显示为处理中并追到最终结果（TASK-0611）。
- 补齐空加载错误和未知操作结果恢复（TASK-0612）。
- 验收兑换码生成确认禁用导出与泄露防护（TASK-0613）。
- 联通Billing与Operations对账积压处置（TASK-0614）。

## 3. 问题来源

[唯一问题表](../repair-issues.md)：F03,F04,F10,F11,F13,F14,F16；[总计划](../plan.md)与[矩阵](../repair-matrices.md)。不在本阶段重复维护问题状态。

## 4. 前置依赖

RC-03/RC-04；积压视图依赖TASK-0703。每个任务的前置比阶段概述更精确。依赖未过只做可独立准备；阶段集成验收必须前置全部满足。默认串行；计划不授权多Agent。

## 5. 明确不在本阶段处理的内容

不新增平台管理员模型，不提供直接改Provider事实、SQL、金额或码明文入口。本轮只改proposal，不修改任何业务源码、迁移、配置、API、UI、测试，不commit/push。后续实现须另获任务派发。

## 6. 当前源码和配置证据

| 问题 | 基线证据 | 当前行为 |
| --- | --- | --- |
| F03 | `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365` | 已有任意 Settlement 提前返回；上轮 paid 后 failed 仍 paid/granted；refund_confirmed 仅本地结案 |
| F04 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:198,202; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:150,207; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:331` | Order 可未归属，Settlement 平台/账户 NOT NULL；上轮插入异常回滚；空平台 Admin scope 也须联查 |
| F10 | `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187` | 实际函数名 admin_billing_order_requery/resolve；上轮resolve原样重放precondition_failed；重查未完整校验同操作参数 |
| F11 | `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560` | 首批50无完整UI翻页；created_at游标缺id；pending/retryable与Job筛选不一致 |
| F13 | `supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235` | RSA canonical不包含status但event key包含；同事件不同hash冲突；通用HMAC header绑定须检查 |
| F14 | `supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195` | Vault缺值直接return；不跟踪pg_net结果；5秒HTTP处理5个顺序任务；processing未完整统计；路径必须含maintenance函数前缀 |
| F16 | `packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101` | 文档26载荷/AISEN前缀与实际31默认不同；Unicode空白规范化不同；未找到窗口限流调用；交付/过期/禁用需保留负向验收 |

## 7. 修改文件清单

下列为未来实施候选，历史迁移只读；本轮仅该阶段计划文件发生文档改动。

- `apps/admin/features/billing/central-billing-page.tsx`
- `apps/admin/app/api/v1/[...path]/route.ts`
- `tests/spikes/e2e/t12-r2-admin.mjs`
- `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/functions/account-api/index.ts`
- `docs/reference/contracts/admin.openapi.json`
- `packages/domain/src/contracts/api.ts`
- `supabase/tests/bill_06_admin_billing_and_consumer_authorization.sql`
- `supabase/tests/t10_role_negative.sql`
- `supabase/tests/t13_platform_key_principal.sql`
- `supabase/functions/maintenance/index.ts`
- `apps/admin/features/subscriptions/platform-subscription-page.tsx`
- `supabase/migrations/20260911124902_bill_03_redemption_v2_lifecycle.sql`：只读旧定义；新增forward-fix代替编辑它。
- `apps/admin/features/security/admin-recent-mfa-panel.tsx`
- `apps/admin/features/redemption/platform-redemption-batches-page.tsx`
- `apps/admin/features/operations/operations-center-page.tsx`

## 8. 数据库迁移清单

| 任务 | 迁移需求 | 生成/依赖/升级约束 |
| --- | --- | --- |
| TASK-0601 | 新增forward-fix | 候选slug repair_task_0601；前置 TASK-0101,TASK-0304；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0602 | 新增forward-fix | 候选slug repair_task_0602；前置 TASK-0102,TASK-0601；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0603 | 新增forward-fix | 候选slug repair_task_0603；前置 TASK-0601,TASK-0402；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0604 | 新增forward-fix | 候选slug repair_task_0604；前置 TASK-0402,TASK-0609,TASK-0610；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0605 | 新增forward-fix | 候选slug repair_task_0605；前置 TASK-0302,TASK-0303,TASK-0603；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0606 | 新增forward-fix | 候选slug repair_task_0606；前置 TASK-0303,TASK-0304,TASK-0403,TASK-0609,TASK-0610；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0607 | 新增forward-fix | 候选slug repair_task_0607；前置 TASK-0401,TASK-0403,TASK-0610；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0608 | 新增forward-fix | 候选slug repair_task_0608；前置 TASK-0201,TASK-0403,TASK-0603；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0609 | 新增forward-fix | 候选slug repair_task_0609；前置 TASK-0101,TASK-0304；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0610 | 新增forward-fix | 候选slug repair_task_0610；前置 TASK-0102；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0611 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0612 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0613 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0614 | 无 | 不改数据库；若需求变化先修计划。 |

所有迁移先核对 `pnpm exec supabase --version`、`pnpm exec supabase migration new --help`，再用 `pnpm exec supabase migration new <已审核slug>`。尖括号为占位不可原样执行；本轮不运行生成命令，不手造时间戳。确认前置迁移已应用、旧函数最后定义、依赖视图/触发器、DDL锁时间、回填批量/检查点和权限负例。远程schema变更需实际授权；不使用linked reset。迁移实际文件清单在执行时追加verification-record，不以候选slug计已生成。

## 9. API/OpenAPI/DTO/SDK 影响

逐任务列出的合同文件必须与[影响矩阵](../repair-matrices.md)一起验收。新增字段采用兼容扩展；不得静默更名现有跨模块字段，`/v1/plans`不改义。没有独立Admin SDK包，使用现有Admin请求封装与中央API DTO。函数名称和最新重定义在实施前重新rg，不能照抄上轮概述中的简称。

## 10. Consumer/Admin UI 影响

- TASK-0601：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—能找到指定平台/账户/Provider所有异常单。
- TASK-0602：Consumer—跨平台用户404且不泄露存在性；Admin—全局管理员过滤准确，非管理员不可见。
- TASK-0603：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—明确事件来源和当前/目标状态。
- TASK-0604：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—可查看最新权威观察时间、失败类别和下一步。
- TASK-0605：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—事件和任务可互相导航且事实不混用。
- TASK-0606：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—管理员知道该等候、补证、重查还是补偿。
- TASK-0607：Consumer—当前有效权益随服务器结果更新；Admin—四种动作均有影响预览和原因审计。
- TASK-0608：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—显示实际开始/结束，99年不是永久。
- TASK-0609：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—未知结果不提示再点一个新操作。
- TASK-0610：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—操作按钮说明原因、MFA和资金/权益风险。
- TASK-0611：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—处理中/完成/失败三态明确，任务ID可追溯。
- TASK-0612：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—loading/empty/error/retry都有可访问文本与动作。
- TASK-0613：Consumer—兑换拒绝原因明确且失败不消耗；Admin—每个批次有actor/operation/审计，禁用不可复活。
- TASK-0614：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—指标来源/时间/环境明确，未接数据标未知。

## 11. 详细执行步骤

执行每个已派发任务：基线和前置→保留失败用例→最小领域/合同改动→同步消费者→定向验证→记录失败恢复和交接。以下清单不自动授权连续执行整个阶段。

<a id="task-0601"></a>
### TASK-0601：实现订单列表服务端搜索筛选与复合游标

- 目标：页面完整遍历无漏项，所有过滤在服务端生效。
- 问题证据：F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`。原行为为单时间游标、首批50条且无服务端筛选；本轮已新增复合游标、筛选和增量加载回归。
- 影响范围：F11；Admin检索。
- 前置依赖：TASK-0101,TASK-0304。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`supabase/functions/account-api`、`docs/reference/contracts`、`packages/domain/src/contracts`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 实际变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`docs/reference/contracts/admin.openapi.json`、`supabase/migrations/20260914060714_repair_task_0601.sql`、`supabase/tests/bill_13_admin_billing_pagination.sql`；代理路由和领域 DTO 无需改动。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0601`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. SQL增加平台/账户/Provider/各独立状态/时间及精确支持编号筛选。
    2. 游标编码created_at+id并与同一排序及过滤绑定。
    3. UI支持下一页/重置过滤，Job pending/retryable按真实Job字段过滤。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0601-NEG`；同时间戳超过50条漏单、恶意游标、状态过滤空错。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0601-REC`；翻页间新订单插入/状态更新，重试不会重复追加列表。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：能找到指定平台/账户/Provider所有异常单。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 实际结果：v2 函数保留旧函数兼容性，绑定 `created_at + order_id` 复合游标，支持状态/平台/平台账号/Provider账号/订单号服务端筛选，并添加排序与过滤索引；Admin UI 支持应用/清除筛选及“加载更多”。`bill_13` 实际验证同时间戳分页、未关联筛选、组合查询、恶意游标和limit边界。
- 预期结果：页面完整遍历无漏项，所有过滤在服务端生效。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现及回归PASS；已提交并推送后再更新 commit/远端核对，Staging/Provider/生产/E2E/可访问性仍按门槛记录为NOT_RUN。

<a id="task-0602"></a>
### TASK-0602：验证平台范围、跨账户与中央管理员边界

- 目标：中央可见与用户隔离分开证明，无新增租户角色或宽RLS。
- 问题证据：F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`；F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F11,F17；Admin检索、环境/CI/备份/文档。
- 前置依赖：TASK-0102,TASK-0601。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`supabase/functions/account-api`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/migrations/20260914085126_repair_task_0602.sql`、`supabase/tests/repair_task_0602_admin_boundary.sql`。本地回归未改变 Admin 页面、BFF 或公共合同；历史迁移和 TASK-0306 原迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`、`supabase/migrations/20260914052934_repair_task_0306.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0602`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 保持中央system_admin全局权限模型，筛选不作为新增平台管理员授权。
    2. Account域每个ID继续校验平台+账户，Admin写入目标从服务器关系解析。
    3. 按executor测试anon/authenticated/account/admin/job/recovery禁止任意DML和不当函数调用。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0602-NEG`；非Admin查询Billing、用户猜其他平台Checkout、伪造admin/user_id。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0602-REC`；权限撤销/Session退出与在途重查、双会话跨账户operation重用。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：跨平台用户404且不泄露存在性。
- 管理员操作验收：全局管理员过滤准确，非管理员不可见。
- 验收命令：本轮已增加具名 `TASK-0602-NEG` 用例并执行 Local SQL/RLS 回归；Hosted/Admin E2E/真实并发和策略依赖仍按门槛记录为 NOT_RUN。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 实际结果：`repair_task_0602_admin_boundary.sql` 覆盖 Admin wrapper 权限、直接表访问、强制 RLS、伪造 `admin_context`、同一用户跨平台 Checkout 读取和错误 Platform Key；同时发现并通过 forward-fix 修复 TASK-0306 `subscription_checkout_read_v2` 中未限定 `expires_at`/投影字段导致的 PL/pgSQL 名称遮蔽。全量 `pnpm test:db` 通过 50 个 SQL 文件、941 个断言，专项测试 21/21 通过。
- 预期结果：中央可见与用户隔离分开证明，无新增租户角色或宽RLS。Local 负例和回归已通过；TASK-0102 生命周期策略、Hosted 权限、Admin E2E、双会话撤销/在途操作和 Staging 仍未完成。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：Local 权限/跨平台隔离回归及 forward-fix 完成；完整任务仍 BLOCKED/NOT_RUN（TASK-0102、Hosted/Staging、Admin E2E 和恢复并发证据待完成）。

<a id="task-0603"></a>
### TASK-0603：聚合订单详情和完整证据时间线

- 目标：任一订单可追溯从创建到最终权益及人工操作。
- 问题证据：F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`；F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`。本任务新增时间线隔离、时间语义和审计脱敏回归，真实结果见验证记录。
- 影响范围：F11,F03；Admin检索、Order/Settlement/退款。
- 前置依赖：TASK-0601,TASK-0402。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`supabase/functions/account-api`、`docs/reference/contracts`、`packages/domain/src/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/migrations/20260914064806_repair_task_0603.sql`、`supabase/tests/bill_15_admin_billing_timeline.sql`、`apps/admin/features/billing/central-billing-page.tsx`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`docs/reference/contracts/admin.openapi.json`。本阶段未新增BFF/E2E或领域DTO变更；历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0603`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 聚合Checkout、Provider观察、Webhook、Job attempts、Settlement、Grant/correction、管理员审计。
    2. 时间统一UTC并区分Provider时间与本地received/observed，缺值不捏造。
    3. UI按因果关联展示来源/版本/状态，不直接修改facts。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0603-NEG`；只有最后JSON无历史、把received时间当Provider paid_at、其他账户证据混入。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0603-REC`；同时间多事件/新观察到达时分页。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：明确事件来源和当前/目标状态。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：任一订单可追溯从创建到最终权益及人工操作。已通过本地成功路径、跨订单隔离、时间语义、审计白名单和排序断言；Provider/Staging/Production/Admin E2E仍未执行。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现及回归验证完成；外部Provider、Staging、Production、Admin E2E和可访问性仍为NOT_RUN。

<a id="task-0604"></a>
### TASK-0604：让Provider重查成为可追踪异步操作

- 目标：重查不会直接改金额/Grant，结果可追踪并可恢复。
- 问题证据：F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`；F10：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187`；F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F03,F10,F11；Order/Settlement/退款、Admin幂等、Admin检索。
- 前置依赖：TASK-0402,TASK-0609,TASK-0610。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`supabase/functions/account-api`、`supabase/functions/maintenance`、`docs/reference/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`apps/admin/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t12-r2-admin.mjs`、`supabase/functions/account-api/index.ts`、`supabase/functions/maintenance/index.ts`、`docs/reference/contracts/admin.openapi.json`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0604`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 读取已有Provider证据与新重查动作分开。
    2. 提交重查保留operation_id和If-Match，显示入队与查询中。
    3. 按Job/operation查询结果更新事实，not_found/timeout/unpaid分别解释。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0604-NEG`；HTTP202显示查询完成、请求超时新UUID、空facts覆盖已确认事实。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0604-REC`；重复点击、Provider慢返回、同单Webhook竞争。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：可查看最新权威观察时间、失败类别和下一步。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：重查不会直接改金额/Grant，结果可追踪并可恢复。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0605"></a>
### TASK-0605：展示Webhook与Job独立状态及租约诊断

- 目标：运营能分辨未付款/未知/重试/人工/失联。
- 问题证据：F02：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:532,562; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:59; supabase/functions/maintenance/index.ts:655,699`；F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`；F13：`supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235`。本任务新增Webhook/Job状态分离、租约失联和敏感字段脱敏回归，真实结果见验证记录。
- 影响范围：F02,F11,F13；Job/Worker、Admin检索、Webhook安全。
- 前置依赖：TASK-0302,TASK-0303,TASK-0603。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`supabase/functions/account-api`、`docs/reference/contracts`、`packages/domain/src/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/migrations/20260914071235_repair_task_0605.sql`、`supabase/tests/bill_16_admin_billing_diagnostics.sql`、`apps/admin/features/billing/central-billing-page.tsx`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`。复用TASK-0603时间线合同，未新增BFF/E2E或领域DTO；历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0605`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 展示签名结果/hash摘要/事件处理状态及关联Job。
    2. 展示attempts、next_attempt、owner脱敏、lease截止、fence、error_class、dead-letter原因。
    3. 过期processing显示失联而非健康排队，不暴露Token或原始payload。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0605-NEG`；Webhook queued显示已Grant、processing超期未标记、敏感原文展示。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0605-REC`；任务接管时旧详情刷新、不同Job同订单。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：事件和任务可互相导航且事实不混用。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：运营能分辨未付款/未知/重试/人工/失联。已通过本地Webhook签名与Job状态分离、租约失联、重试预算、hash摘要和owner脱敏断言；Provider/Staging/Production/Admin E2E仍未执行。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现及回归验证完成；外部Provider、Staging、Production、Admin E2E和可访问性仍为NOT_RUN。

<a id="task-0606"></a>
### TASK-0606：明确重试、重查、结案与人工复核可用动作

- 目标：每动作有服务器前置、幂等、审计、失败恢复；不允许直接改状态。
- 问题证据：F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`；F04：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:198,202; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:150,207; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:331`；F10：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F03,F04,F10；Order/Settlement/退款、归属/人工复核、Admin幂等。
- 前置依赖：TASK-0303,TASK-0304,TASK-0403,TASK-0609,TASK-0610。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`supabase/functions/account-api`、`docs/reference/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`apps/admin/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t12-r2-admin.mjs`、`supabase/functions/account-api/index.ts`、`docs/reference/contracts/admin.openapi.json`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0606`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 服务端返回每状态可用动作和阻塞原因。
    2. 将重试既有任务、重新查询Provider、人工结案和新补偿操作分开。
    3. 确认前列具体结果并校验reason，已最终处理不自动复活。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0606-NEG`；unlinked结案scope空、finalized重试再Grant、缺原因/权限前端绕过。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0606-REC`；重试与结案并发、操作完成响应丢失。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：管理员知道该等候、补证、重查还是补偿。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：每动作有服务器前置、幂等、审计、失败恢复；不允许直接改状态。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0607"></a>
### TASK-0607：关联订单的Grant撤销暂停恢复及修正

- 目标：领域单入口、强来源关系、事件序列一致，无第二套期限算法。
- 问题证据：F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`；F08：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F03,F08；Order/Settlement/退款、权益/生命周期。
- 前置依赖：TASK-0401,TASK-0403,TASK-0610。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`apps/admin/features/subscriptions`、`supabase/functions/account-api`、`docs/reference/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`apps/admin/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t12-r2-admin.mjs`、`apps/admin/features/subscriptions/platform-subscription-page.tsx`、`supabase/functions/account-api/index.ts`、`docs/reference/contracts/admin.openapi.json`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911124902_bill_03_redemption_v2_lifecycle.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0607`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 从订单关联原Grant和当前有效correction目标。
    2. 复用现有entitlement命令处理Grant/revoke/pause/resume，保留source区分。
    3. 操作后重读订阅和事件，单独显示钱款处理不自动联动退款。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0607-NEG`；任意plan/duration客户端注入、旧Grant撤销错误目标、无MFA提交。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0607-REC`；手工Grant与支付、两次correction、暂停与兑换。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：当前有效权益随服务器结果更新。
- 管理员操作验收：四种动作均有影响预览和原因审计。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：领域单入口、强来源关系、事件序列一致，无第二套期限算法。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0608"></a>
### TASK-0608：展示金额币种Plan期限与权益影响预览

- 目标：管理员能在提交前判断钱款与权益影响，漂移返回冲突。
- 问题证据：F07：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:411; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:126; supabase/migrations/20260912150000_afdian_checkout_payment_link.sql:29`；F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F07,F11,F15；Catalog/Snapshot、Admin检索、Consumer/SDK。
- 前置依赖：TASK-0201,TASK-0403,TASK-0603。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`apps/admin/features/subscriptions`、`supabase/functions/account-api`、`docs/reference/contracts`、`packages/domain/src/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`apps/admin/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t12-r2-admin.mjs`、`apps/admin/features/subscriptions/platform-subscription-page.tsx`、`supabase/functions/account-api/index.ts`、`docs/reference/contracts/admin.openapi.json`、`packages/domain/src/contracts/api.ts`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0608`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 并列展示不可变snapshot、最新Provider实付、当前权益、目标Grant及期限。
    2. preview返回续期区间、空档/撤销影响、Plan冲突、资金影响和版本。
    3. 执行时重新验证preview版本，UI不计算日历或退款比例。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0608-NEG`；旧preview提交、币种/金额差异未提示、未来Grant标当前。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0608-REC`；preview后续费/撤销/下架导致版本漂移。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：显示实际开始/结束，99年不是永久。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：管理员能在提交前判断钱款与权益影响，漂移返回冲突。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0609"></a>
### TASK-0609：修复operation_id重放顺序和If-Match并发

- 目标：原样重放返回原结果，新操作旧版本412，同ID异参409语义一致。
- 问题证据：F10：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187`。原行为先校验 `If-Match`，导致已完成操作的重放被旧版本拒绝；重查 operation_id 也未绑定请求哈希。本轮已新增幂等结果优先和网络未知结果恢复。
- 影响范围：F10；Admin幂等。
- 前置依赖：TASK-0101,TASK-0304。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`supabase/functions/account-api`、`docs/reference/contracts`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 实际变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`supabase/migrations/20260914062808_repair_task_0609.sql`、`supabase/tests/bill_14_admin_operation_idempotency.sql`；Account API合同入口保持兼容，无需修改路由或OpenAPI。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0609`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 按scope+operation_id+request_hash先识别合法重放，再对新操作验证If-Match。
    2. requery绑定order/account/action/reason全部参数，冲突拒绝。
    3. UI请求前保存operation_id，超时用同ID查询或重放，412刷新后作为新意图重新确认。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0609-NEG`；resolve同请求precondition_failed反例、同ID异参数/跨订单返回错误Job。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0609-REC`；两个会话同版本、commit后断响应、重放与新动作交错。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：未知结果不提示再点一个新操作。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 实际结果：重查和结案先读取 `admin_idempotency` 的请求哈希和持久响应，再校验版本；新操作旧版本仍返回 `precondition_failed`，同操作异参/跨订单返回 `idempotency_conflict`。Admin UI 在网络结果未知时复用同一 operation_id 重试。
- 预期结果：原样重放返回原结果，新操作旧版本412，同ID异参409语义一致。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现及回归PASS；已提交并推送后再更新 commit/远端核对，Provider/Staging/生产/Admin E2E/可访问性仍按门槛记录为NOT_RUN。

<a id="task-0610"></a>
### TASK-0610：执行AAL2近期MFA原因审计与风险确认

- 目标：拒绝路径真实HTTP验证，SQL角色边界不放宽；审计可关联但无secret。
- 问题证据：F10：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187`；F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F10,F17；Admin幂等、环境/CI/备份/文档。
- 前置依赖：TASK-0102。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`apps/admin/features/security`、`supabase/functions/account-api`、`docs/reference/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`apps/admin/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t12-r2-admin.mjs`、`apps/admin/features/security/admin-recent-mfa-panel.tsx`、`supabase/functions/account-api/index.ts`、`docs/reference/contracts/admin.openapi.json`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0610`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 核对每个高风险Billing/Grant/兑换码入口的服务端AAL2及近期MFA。
    2. 原因必须显式填写且不以默认文本充当决策，预览后确认具体影响。
    3. 审计记录actor/session关联、operation/目标/前后版本/脱敏原因，前端提示不能代替权限。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0610-NEG`；AAL1/过期MFA/注销Session/伪actor/空原因/CSRF绕过。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0610-REC`；MFA验证后Session撤销、两会话抢提交。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：操作按钮说明原因、MFA和资金/权益风险。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：拒绝路径真实HTTP验证，SQL角色边界不放宽；审计可关联但无secret。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0611"></a>
### TASK-0611：将HTTP202显示为处理中并追到最终结果

- 目标：202只证明受理，最终动作有可检验结果。
- 问题证据：F10：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187`；F14：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F10,F14；Admin幂等、cron/观测。
- 前置依赖：TASK-0604,TASK-0605。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`docs/reference/contracts`、`packages/domain/src/contracts`。
- 变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`apps/admin/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t12-r2-admin.mjs`、`docs/reference/contracts/admin.openapi.json`、`packages/domain/src/contracts/api.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 202保存job/operation ID并显示已受理。
    2. 查询状态至completed/manual/dead-letter，有界轮询与手动刷新。
    3. 重进页面恢复未完成操作，最终失败显示原因而非绿色成功。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0611-NEG`；202但Job未运行/内部503、超时后丢失operation。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0611-REC`；两个Tab观察同一任务、Worker重启接管。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：处理中/完成/失败三态明确，任务ID可追溯。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：202只证明受理，最终动作有可检验结果。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0612"></a>
### TASK-0612：补齐空加载错误和未知操作结果恢复

- 目标：各状态可理解可恢复，无假成功或跨订单混显。
- 问题证据：F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`；F10：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:271,328,346; apps/admin/features/billing/central-billing-page.tsx:155,187`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F11,F10；Admin检索、Admin幂等。
- 前置依赖：TASK-0601,TASK-0609,TASK-0611。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`。
- 变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`apps/admin/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t12-r2-admin.mjs`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 空列表区分无订单/过滤无匹配/无权限/请求失败。
    2. 详情loading和busy不覆盖既有选中订单证据。
    3. unknown outcome保留意图并给查询入口，键盘焦点返回安全位置。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0612-NEG`；错误显示空列表、失败后详情残留其他订单、重复提交按钮恢复过早。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0612-REC`；过滤快速切换响应乱序、断网重进页面。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：loading/empty/error/retry都有可访问文本与动作。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：各状态可理解可恢复，无假成功或跨订单混显。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0613"></a>
### TASK-0613：验收兑换码生成确认禁用导出与泄露防护

- 目标：两阶段交付所有路径可追溯，真实码不进入测试证据。
- 问题证据：F16：`packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F16；兑换码。
- 前置依赖：TASK-0404,TASK-0405,TASK-0610。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/redemption`、`apps/admin/app/api/v1/[...path]`、`supabase/functions/account-api`、`docs/reference/contracts`、`tests/spikes/e2e`。
- 变更文件：`apps/admin/features/redemption/platform-redemption-batches-page.tsx`、`apps/admin/app/api/v1/[...path]/route.ts`、`supabase/functions/account-api/index.ts`、`docs/reference/contracts/admin.openapi.json`、`tests/spikes/e2e/t12-r2-admin.mjs`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 生成前展示平台/商品/数量/期限/交付截止并保存operation。
    2. 明文仅首次授权交付，确认收妥后激活，超时不重新泄露。
    3. 禁用批次提示未使用码影响并与已兑换Grant撤销分开，导出无缓存/埋点。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0613-NEG`；重复导出/跨session receipt/生成响应丢失/截图日志捕获码/禁用后激活。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0613-REC`；两个Admin生成确认、禁用与用户兑换、轮换旧密钥。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：兑换拒绝原因明确且失败不消耗。
- 管理员操作验收：每个批次有actor/operation/审计，禁用不可复活。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：两阶段交付所有路径可追溯，真实码不进入测试证据。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0614"></a>
### TASK-0614：联通Billing与Operations对账积压处置

- 目标：运营能发现和处理漏单/失联/退款差异，并看到恢复结果。
- 问题证据：F06：`supabase/functions/_shared/afdian.ts:255; supabase/functions/maintenance/index.ts:792; supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:457`；F11：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:50,95; apps/admin/features/billing/central-billing-page.tsx:96; supabase/functions/account-api/index.ts:1560`；F14：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F06,F11,F14；对账、Admin检索、cron/观测。
- 前置依赖：TASK-0701,TASK-0703,TASK-0605,TASK-0606。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/admin/features/billing`、`apps/admin/app/api/v1/[...path]`、`tests/spikes/e2e`、`apps/admin/features/operations`、`supabase/functions/account-api`、`docs/reference/contracts`。
- 变更文件：`apps/admin/features/billing/central-billing-page.tsx`、`apps/admin/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t12-r2-admin.mjs`、`apps/admin/features/operations/operations-center-page.tsx`、`supabase/functions/account-api/index.ts`、`docs/reference/contracts/admin.openapi.json`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 区分发现进度、处理进度、cron调用和业务成功时间。
    2. 展示oldest pending/retryable/processing失联/manual/duplicate/refund差异和阈值。
    3. 从异常指标导航过滤订单与受控动作，禁止一键任意状态清零。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0614-NEG`；HTTP200但积压增长、游标推进掩盖旧失败、零任务假健康。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0614-REC`；刷新期间接管/重排、批次部分失败。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：指标来源/时间/环境明确，未接数据标未知。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：运营能发现和处理漏单/失联/退款差异，并看到恢复结果。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
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

- [x] TASK-0601：页面完整遍历无漏项，所有过滤在服务端生效（本地 SQL/API/UI 类型回归 PASS）。
- [ ] TASK-0602：中央可见与用户隔离分开证明，无新增租户角色或宽RLS。
- [x] TASK-0603：任一订单可追溯从创建到最终权益及人工操作（本地 SQL/API/Admin 类型回归 PASS；外部环境待验证）。
- [ ] TASK-0604：重查不会直接改金额/Grant，结果可追踪并可恢复。
- [x] TASK-0605：运营能分辨未付款/未知/重试/人工/失联（本地 SQL/API/Admin 类型回归 PASS；外部环境待验证）。
- [ ] TASK-0606：每动作有服务器前置、幂等、审计、失败恢复；不允许直接改状态。
- [ ] TASK-0607：领域单入口、强来源关系、事件序列一致，无第二套期限算法。
- [ ] TASK-0608：管理员能在提交前判断钱款与权益影响，漂移返回冲突。
- [x] TASK-0609：原样重放返回原结果，新操作旧版本412，同ID异参409语义一致（本地 SQL/API/UI 类型回归 PASS）。
- [ ] TASK-0610：拒绝路径真实HTTP验证，SQL角色边界不放宽；审计可关联但无secret。
- [ ] TASK-0611：202只证明受理，最终动作有可检验结果。
- [ ] TASK-0612：各状态可理解可恢复，无假成功或跨订单混显。
- [ ] TASK-0613：两阶段交付所有路径可追溯，真实码不进入测试证据。
- [ ] TASK-0614：运营能发现和处理漏单/失联/退款差异，并看到恢复结果。
- [ ] 前置未过不标完成；每项结果覆盖成功、失败、并发和恢复，不只HTTP200。
- [ ] 无已知P1在本阶段边界被隐藏；无放宽权限、删除测试或交易数据。
- [ ] SQL/API/SDK/BFF/UI/Registry相关消费者同步，兼容与回退实际验证。

## 15. 交接给下一阶段的输出

每任务提交给下一任务：具体文件diff、迁移实际顺序、合同版本/兼容窗口、前后失败证据、最后权威状态、风险/未验证项、回退停止点。参考[全局任务依赖表](../repair-matrices.md)。本轮禁止提交与推送；后续是否提交按届时用户授权，不能从历史附录继承。

## 16. 未完成事项和 NOT_RUN 项

全部TASK尚未实施；所需真实Provider合同、D1/D2/D3、告警责任/阈值、外部备份目标、staging/生产授权按任务标注。文档静态通过不把本阶段标验收通过。修复后才将实际事实同步architecture/reference/guides，本轮只整理proposal。
