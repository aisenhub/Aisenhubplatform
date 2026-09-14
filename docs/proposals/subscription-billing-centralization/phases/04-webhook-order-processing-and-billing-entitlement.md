# RC-03：权威核验、Inbox、租约与未关联订单

## 1. 阶段名称和状态

状态：执行中；TASK-0301 至 TASK-0306 已完成本地实现与回归，Provider/Staging/生产门槛仍未完成。当前派发以 TASK ID 为准，文件名为历史兼容路径。旧BILL记录只通过末尾归档链接引用，不是当前验收状态或执行授权。

## 2. 阶段目标

- 修复Provider必填字段NULL放行及精确合同核验（TASK-0301）。
- 实现过期processing接管与全入口fencing（TASK-0302）。
- 分类重试、人工队列和受控死信重排（TASK-0303）。
- 让未关联paid稳定进入隔离人工队列（TASK-0304）。
- 收紧Webhook事件身份、签名合同及ACK恢复（TASK-0305）。
- 统一用户Checkout交易进度投影与过期读取（TASK-0306）。

## 3. 问题来源

[唯一问题表](../repair-issues.md)：F01,F02,F04,F05,F12,F13；[总计划](../plan.md)与[矩阵](../repair-matrices.md)。不在本阶段重复维护问题状态。

## 4. 前置依赖

TASK-0101；完整集成等待RC-02；0301/0302可先独立修复。每个任务的前置比阶段概述更精确。依赖未过只做可独立准备；阶段集成验收必须前置全部满足。默认串行；计划不授权多Agent。

## 5. 明确不在本阶段处理的内容

不把Webhook当支付凭证，不接用户自助认领，不开放真实购买。本轮已按用户派发实施 TASK-0301、TASK-0302；其余任务仍需满足各自前置依赖与授权。

## 6. 当前源码和配置证据

| 问题 | 基线证据 | 当前行为 |
| --- | --- | --- |
| F01 | `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:128,155; supabase/functions/_shared/afdian.ts:403,435` | v_valid 可为 NULL；NOT NULL 判断未 fail-closed；上轮虚构 paid 缺 plan 得到 granted/granted/finalized、1 Grant |
| F02 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:532,562; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:59; supabase/functions/maintenance/index.ts:655,699` | claim 只 pending/retryable；lease deadline 未统一校验；上轮 expired processing reclaimed=0；重试固定一分钟无上限 |
| F04 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:198,202; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:150,207; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:331` | Order 可未归属，Settlement 平台/账户 NOT NULL；上轮插入异常回滚；空平台 Admin scope 也须联查 |
| F05 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264` | 上轮 blocked/review_required 对应 Checkout pending；只成功路径写 granted；到期未形成完整状态 |
| F12 | `supabase/functions/_shared/afdian.ts:358,365,378,441,452; packages/domain/src/contracts/billing.ts:98` | quantity固定1、SQL只收sku_ids；未知状态failed；数字金额toFixed；无独立退款事实 |
| F13 | `supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235` | RSA canonical不包含status但event key包含；同事件不同hash冲突；通用HMAC header绑定须检查 |

## 7. 修改文件清单

下列为未来实施候选，历史迁移只读；本轮仅该阶段计划文件发生文档改动。

- `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/functions/_shared/afdian.ts`
- `packages/domain/src/contracts/billing.ts`
- `supabase/functions/account-api/index.ts`
- `supabase/functions/maintenance/index.ts`
- `supabase/tests/bill_05_provider_verification_settlement.sql`
- `supabase/functions/_shared/afdian.test.ts`
- `docs/reference/contracts/account.openapi.json`
- `docs/reference/contracts/admin.openapi.json`
- `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/migrations/20260912103423_bill_11_afdian_discovery_worker.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/tests/bill_04_checkout_order_inbox_jobs.sql`
- `supabase/functions/maintenance/index.test.ts`
- `supabase/migrations/20260913195500_bill_14_provider_contract_requeue_fix.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/tests/bill_06_admin_billing_and_consumer_authorization.sql`
- `supabase/functions/billing-webhook/index.ts`
- `supabase/functions/billing-webhook/index.test.ts`
- `packages/domain/src/contracts/api.ts`
- `packages/account-server/src/index.ts`
- `supabase/functions/account-api/index.test.ts`

## 8. 数据库迁移清单

| 任务 | 迁移需求 | 生成/依赖/升级约束 |
| --- | --- | --- |
| TASK-0301 | 新增forward-fix | 候选slug repair_task_0301；前置 TASK-0001,TASK-0101；完整snapshot集成依赖TASK-0201；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0302 | 新增forward-fix | 候选slug repair_task_0302；前置 TASK-0001,TASK-0101；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0303 | 新增forward-fix | 候选slug repair_task_0303；前置 TASK-0302,TASK-0301；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0304 | 新增forward-fix | 候选slug repair_task_0304；前置 TASK-0101,TASK-0302；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0305 | 新增forward-fix | 候选slug repair_task_0305；前置 TASK-0101,TASK-0302；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0306 | 新增forward-fix | 候选slug repair_task_0306；前置 TASK-0101,TASK-0301,TASK-0304；补偿状态依赖TASK-0402；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |

所有迁移先核对 `pnpm exec supabase --version`、`pnpm exec supabase migration new --help`，再用 `pnpm exec supabase migration new <已审核slug>`。尖括号为占位不可原样执行；本轮不运行生成命令，不手造时间戳。确认前置迁移已应用、旧函数最后定义、依赖视图/触发器、DDL锁时间、回填批量/检查点和权限负例。远程schema变更需实际授权；不使用linked reset。迁移实际文件清单在执行时追加verification-record，不以候选slug计已生成。

## 9. API/OpenAPI/DTO/SDK 影响

逐任务列出的合同文件必须与[影响矩阵](../repair-matrices.md)一起验收。新增字段采用兼容扩展；不得静默更名现有跨模块字段，`/v1/plans`不改义。没有独立Admin SDK包，使用现有Admin请求封装与中央API DTO。函数名称和最新重定义在实施前重新rg，不能照抄上轮概述中的简称。

## 10. Consumer/Admin UI 影响

- TASK-0301：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0302：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0303：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0304：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0305：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0306：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。

## 11. 详细执行步骤

执行每个已派发任务：基线和前置→保留失败用例→最小领域/合同改动→同步消费者→定向验证→记录失败恢复和交接。以下清单不自动授权连续执行整个阶段。

<a id="task-0301"></a>
### TASK-0301：修复Provider必填字段NULL放行及精确合同核验

- 目标：任何不完整/不匹配事实零Grant；清晰contract error进入可恢复队列，不把未知当未付。
- 问题证据：F01：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:128,155; supabase/functions/_shared/afdian.ts:403,435`；F12：`supabase/functions/_shared/afdian.ts:358,365,378,441,452; packages/domain/src/contracts/billing.ts:98`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F01,F12；结算/Provider、Provider合同。
- 前置依赖：TASK-0001,TASK-0101；完整snapshot集成依赖TASK-0201。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/_shared`、`packages/domain/src/contracts`、`supabase/functions/account-api`、`supabase/functions/maintenance`、`supabase/tests`、`docs/reference/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/_shared/afdian.ts`、`packages/domain/src/contracts/billing.ts`、`supabase/functions/account-api/index.ts`、`supabase/functions/maintenance/index.ts`、`supabase/tests/bill_05_provider_verification_settlement.sql`、`supabase/functions/_shared/afdian.test.ts`、`docs/reference/contracts/account.openapi.json`、`docs/reference/contracts/admin.openapi.json`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0301`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 先保存缺plan paid产生Grant的失败用例。
    2. SQL使用显式必填和IS TRUE判定，Adapter拒绝缺值/类型漂移但保留unknown观察。
    3. 核对Provider商户账户、external_order_id、custom_order及本地归属，再验证金额字符串/币种/plan/type/SKU数量/月数/折扣规则，并与0201 snapshot集成。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0301-NEG`；每个必填字段独立null/空/错误类型；count2/零元/未知状态/金额多余小数。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0301-REC`；Provider正常paid与错误响应交错；重试仍只授予一次。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：任何不完整/不匹配事实零Grant；清晰contract error进入可恢复队列，不把未知当未付。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现完成；实施测试状态PASS（Provider/Staging/生产门槛仍NOT_RUN，见verification-record）。

<a id="task-0302"></a>
### TASK-0302：实现过期processing接管与全入口fencing

- 目标：新Worker能在lease期限后接管，旧Worker零业务写入，所有任务具有可观测后继状态。
- 问题证据：F02：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:532,562; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:59; supabase/functions/maintenance/index.ts:655,699`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F02；Job/Worker。
- 前置依赖：TASK-0001,TASK-0101。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/maintenance`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/maintenance/index.ts`、`supabase/tests/bill_04_checkout_order_inbox_jobs.sql`、`supabase/functions/maintenance/index.test.ts`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`、`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`、`supabase/migrations/20260912103423_bill_11_afdian_discovery_worker.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0302`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. claim在锁下允许过期processing重领并递增fence。
    2. query/link/verify/finish/游标提交共同校验owner/fence/lease，定义截止语义。
    3. 为每个领取后配置关闭、解析失败和异常路径持久finish或让租约可接管，不靠未跟踪Promise。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0302-NEG`；expired processing reclaimed=0反例；旧owner/旧fence/过期lease写入拒绝。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0302-REC`；双Worker抢领、kill后接管、旧Worker迟到、finish重复和响应丢失。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：新Worker能在lease期限后接管，旧Worker零业务写入，所有任务具有可观测后继状态。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现完成；实施测试状态PASS（Provider/Staging/生产门槛仍NOT_RUN，见verification-record）。

<a id="task-0303"></a>
### TASK-0303：分类重试、人工队列和受控死信重排

- 目标：所有错误有下一步、截止/人工责任；死信可用manual_review子类表达但必须可检索可审计。
- 问题证据：F02：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:532,562; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:59; supabase/functions/maintenance/index.ts:655,699`；F14：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F02,F14；Job/Worker、cron/观测。
- 前置依赖：TASK-0302,TASK-0301。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/maintenance`、`packages/domain/src/contracts`、`docs/reference/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/maintenance/index.ts`、`packages/domain/src/contracts/billing.ts`、`docs/reference/contracts/admin.openapi.json`、`supabase/functions/maintenance/index.test.ts`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260912103423_bill_11_afdian_discovery_worker.sql`、`supabase/migrations/20260913195500_bill_14_provider_contract_requeue_fix.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0303`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 分离timeout/429/invalid contract/not_found/业务冲突/永久错误。
    2. 实现有上限退避、jitter、Retry-After预算和人工dead-letter语义，保留attempts与原因。
    3. 将requeue限定为授权可恢复类别，operation/version/fence控制且不复活退款/最终结案。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0303-NEG`；次数触顶不能无限retry；permanent error不得自动重排；错误码兼容。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0303-REC`；批次停机重启、部分503、同一dead-letter两次重排。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：所有错误有下一步、截止/人工责任；死信可用manual_review子类表达但必须可检索可审计。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现完成；实施测试状态PASS（Provider/Staging/生产门槛仍NOT_RUN，见verification-record）。

<a id="task-0304"></a>
### TASK-0304：让未关联paid稳定进入隔离人工队列

- 目标：不再SQL错误无限重试；未关联钱款可见、唯一、可审计；不新增OAuth或用户认领。
- 问题证据：F04：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:198,202; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:150,207; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:331`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F04；归属/人工复核。
- 前置依赖：TASK-0101,TASK-0302。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/account-api`、`packages/domain/src/contracts`、`docs/reference/contracts`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/account-api/index.ts`、`packages/domain/src/contracts/billing.ts`、`docs/reference/contracts/admin.openapi.json`、`supabase/tests/bill_05_provider_verification_settlement.sql`、`supabase/tests/bill_06_admin_billing_and_consumer_authorization.sql`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`、`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`、`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0304`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 新增forward-fix表达无归属付款隔离，不给平台/账户伪造默认值。
    2. 修正settlement插入与Admin idempotency scope/列表/处理前置，保持已关联组复合FK。
    3. 只能由受控人工流程审查证据，订单关联一旦确定不可自动改归属。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0304-NEG`；保留platform_id NOT NULL反例；未知/空/歧义custom order。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0304-REC`；同一未关联订单重复通知/重查；人工处理与自动关联竞争。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：不再SQL错误无限重试；未关联钱款可见、唯一、可审计；不新增OAuth或用户认领。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现完成；实施测试状态PASS（Provider/Staging/生产门槛仍NOT_RUN，见verification-record）。

<a id="task-0305"></a>
### TASK-0305：收紧Webhook事件身份、签名合同及ACK恢复

- 目标：相同事实去重且冲突留痕；Webhook永远不直接授予；真实签名仍需独立Provider验收。
- 问题证据：F13：`supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F13；Webhook安全。
- 前置依赖：TASK-0101,TASK-0302。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/_shared`、`supabase/functions/billing-webhook`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/_shared/afdian.ts`、`supabase/functions/billing-webhook/index.ts`、`supabase/functions/_shared/afdian.test.ts`、`supabase/functions/billing-webhook/index.test.ts`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0305`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 固定官方RSA canonical、公钥来源/轮换及通用HMAC使用范围。
    2. 事件去重身份只依赖可信内容，未签status/header不能无界制造Job。
    3. 保留原始字节hash、事务提交后ACK和有限payload，签名无效不进入可信结算。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0305-NEG`；签名位翻转、order/header改写、同键异hash、未签字段100次变体。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0305-REC`；ACK前DB失败、ACK后进程kill、重复投递不吞已存在任务的恢复。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：相同事实去重且冲突留痕；Webhook永远不直接授予；真实签名仍需独立Provider验收。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现完成；实施测试状态PASS（Provider/Staging/生产门槛仍NOT_RUN，见verification-record）。

<a id="task-0306"></a>
### TASK-0306：统一用户Checkout交易进度投影与过期读取

- 目标：所有状态都有可解释DTO和合法转换；只读刷新不伪称主动Provider查询。
- 问题证据：F05：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F05；Checkout/Consumer。
- 前置依赖：TASK-0101,TASK-0301,TASK-0304；补偿状态依赖TASK-0402。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/account-api`、`packages/domain/src/contracts`、`docs/reference/contracts`、`packages/account-server/src`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/account-api/index.ts`、`packages/domain/src/contracts/billing.ts`、`packages/domain/src/contracts/api.ts`、`docs/reference/contracts/account.openapi.json`、`packages/account-server/src/index.ts`、`supabase/functions/account-api/index.test.ts`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`、`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`、`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0306`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 在共享查询/结算过程投影付款事实、验证、Job/人工状态与权益区间。
    2. 让review/resolve/失败和到期读取一致，但已付不降expired。
    3. 用户响应只含本账户可见原因和动作，独立effective subscription读取当前生效Grant。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0306-NEG`；blocked/review对应Checkout pending反例；未来Grant不得active；第二笔异常不能覆盖首笔成功。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0306-REC`；查单与Grant事务提交交错、退款/复核状态刷新。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：所有状态都有可解释DTO和合法转换；只读刷新不伪称主动Provider查询。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现完成；实施测试状态PASS（TASK-0402补偿链路及Provider/Staging/生产门槛仍NOT_RUN，见verification-record）。

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

- [ ] TASK-0301：任何不完整/不匹配事实零Grant；清晰contract error进入可恢复队列，不把未知当未付。
- [ ] TASK-0302：新Worker能在lease期限后接管，旧Worker零业务写入，所有任务具有可观测后继状态。
- [ ] TASK-0303：所有错误有下一步、截止/人工责任；死信可用manual_review子类表达但必须可检索可审计。
- [x] TASK-0304：不再SQL错误无限重试；未关联钱款可见、唯一、可审计；不新增OAuth或用户认领。
- [x] TASK-0305：相同事实去重且冲突留痕；Webhook永远不直接授予；真实签名仍需独立Provider验收。
- [x] TASK-0306：所有状态都有可解释DTO和合法转换；只读刷新不伪称主动Provider查询。
- [ ] 前置未过不标完成；每项结果覆盖成功、失败、并发和恢复，不只HTTP200。
- [ ] 无已知P1在本阶段边界被隐藏；无放宽权限、删除测试或交易数据。
- [ ] SQL/API/SDK/BFF/UI/Registry相关消费者同步，兼容与回退实际验证。

## 15. 交接给下一阶段的输出

每任务提交给下一任务：具体文件diff、迁移实际顺序、合同版本/兼容窗口、前后失败证据、最后权威状态、风险/未验证项、回退停止点。参考[全局任务依赖表](../repair-matrices.md)。本轮禁止提交与推送；后续是否提交按届时用户授权，不能从历史附录继承。

## 16. 未完成事项和 NOT_RUN 项

全部TASK尚未实施；所需真实Provider合同、D1/D2/D3、告警责任/阈值、外部备份目标、staging/生产授权按任务标注。文档静态通过不把本阶段标验收通过。修复后才将实际事实同步architecture/reference/guides，本轮只整理proposal。

历史阶段保留在[归档文件](../../../archive/subscription-billing-centralization/phases/04-webhook-order-processing-and-billing-entitlement.md)；只作来源，状态和派发规则不作为本次修复验收。
