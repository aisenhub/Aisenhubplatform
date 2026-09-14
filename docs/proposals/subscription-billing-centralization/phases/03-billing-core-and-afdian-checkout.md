# RC-04：共享权益、事实刷新、退款补偿与兑换码

## 1. 阶段名称和状态

状态：执行中；TASK-0402 已完成本地实现与回归，TASK-0401 仍受生命周期政策依赖阻塞，TASK-0403 至 TASK-0405 尚未开始。当前派发以 TASK ID 为准，文件名为历史兼容路径。旧BILL记录只通过末尾归档链接引用，不是当前验收状态或执行授权。

## 2. 阶段目标

- 统一授予与兑换的生命周期、锁与起算时间（TASK-0401）。
- 拆分Provider观察更新和幂等结算动作（TASK-0402）。
- 建立退款撤销拒付冲正与Grant补偿关联（TASK-0403）。
- 统一已发行兑换码协议与两阶段交付验收（TASK-0404）。
- 把兑换与公开入口限流接入实际领域调用（TASK-0405）。

## 3. 问题来源

[唯一问题表](../repair-issues.md)：F03,F08,F16；[总计划](../plan.md)与[矩阵](../repair-matrices.md)。不在本阶段重复维护问题状态。

## 4. 前置依赖

RC-01/RC-03；退款具体政策等待D2/D3。每个任务的前置比阶段概述更精确。依赖未过只做可独立准备；阶段集成验收必须前置全部满足。默认串行；计划不授权多Agent。

## 5. 明确不在本阶段处理的内容

不新增Provider自动退款API，不把禁用批次等同撤销已发Grant。本轮只改proposal，不修改任何业务源码、迁移、配置、API、UI、测试，不commit/push。后续实现须另获任务派发。

## 6. 当前源码和配置证据

| 问题 | 基线证据 | 当前行为 |
| --- | --- | --- |
| F03 | `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365` | 已有任意 Settlement 提前返回；上轮 paid 后 failed 仍 paid/granted；refund_confirmed 仅本地结案 |
| F08 | `supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48` | 上轮 disabled 平台可授予；paused 下新增 Grant但subscription仍suspended；Plan读取锁和时间基准需统一 |
| F16 | `packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101` | 文档26载荷/AISEN前缀与实际31默认不同；Unicode空白规范化不同；未找到窗口限流调用；交付/过期/禁用需保留负向验收 |

## 7. 修改文件清单

下列为未来实施候选，历史迁移只读；本轮仅该阶段计划文件发生文档改动。

- `supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/migrations/20260908103340_m3_dual_secret_redeem.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/migrations/20260911124902_bill_03_redemption_v2_lifecycle.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/tests/m3_entitlement_ledger.sql`
- `supabase/tests/t14_account_lifecycle.sql`
- `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/functions/_shared/afdian.ts`
- `supabase/functions/maintenance/index.ts`
- `packages/domain/src/contracts/billing.ts`
- `docs/reference/contracts/admin.openapi.json`
- `supabase/tests/bill_05_provider_verification_settlement.sql`
- `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/functions/account-api/index.ts`
- `packages/domain/src/contracts/api.ts`
- `apps/admin/features/subscriptions/platform-subscription-page.tsx`
- `supabase/tests/bill_03_redemption_v2_lifecycle.sql`
- `supabase/tests/bill_06_admin_billing_and_consumer_authorization.sql`
- `packages/domain/src/redemption.ts`
- `docs/reference/contracts/account.openapi.json`
- `apps/admin/features/redemption/platform-redemption-batches-page.tsx`
- `packages/domain/tests/billing.test.ts`
- `supabase/tests/bill_07_upgrade_compatibility.sql`
- `supabase/functions/billing-webhook/index.ts`
- `supabase/migrations/20260907103848_security_helpers.sql`：只读旧定义；新增forward-fix代替编辑它。
- `packages/domain/src/contracts/errors.ts`
- `supabase/functions/account-api/index.test.ts`
- `supabase/tests/t09_security_helpers.sql`

## 8. 数据库迁移清单

| 任务 | 迁移需求 | 生成/依赖/升级约束 |
| --- | --- | --- |
| TASK-0401 | 新增forward-fix | 候选slug repair_task_0401；前置 TASK-0102,TASK-0302；暂停/保留政策依赖D3；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0402 | 新增forward-fix | 候选slug repair_task_0402；前置 TASK-0301,TASK-0302,TASK-0304；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0403 | 新增forward-fix | 候选slug repair_task_0403；前置 TASK-0401,TASK-0402；D2/D3；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0404 | 新增forward-fix | 候选slug repair_task_0404；前置 TASK-0102,TASK-0401；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0405 | 新增forward-fix | 候选slug repair_task_0405；前置 TASK-0404,TASK-0305；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |

所有迁移先核对 `pnpm exec supabase --version`、`pnpm exec supabase migration new --help`，再用 `pnpm exec supabase migration new <已审核slug>`。尖括号为占位不可原样执行；本轮不运行生成命令，不手造时间戳。确认前置迁移已应用、旧函数最后定义、依赖视图/触发器、DDL锁时间、回填批量/检查点和权限负例。远程schema变更需实际授权；不使用linked reset。迁移实际文件清单在执行时追加verification-record，不以候选slug计已生成。

## 9. API/OpenAPI/DTO/SDK 影响

逐任务列出的合同文件必须与[影响矩阵](../repair-matrices.md)一起验收。新增字段采用兼容扩展；不得静默更名现有跨模块字段，`/v1/plans`不改义。没有独立Admin SDK包，使用现有Admin请求封装与中央API DTO。函数名称和最新重定义在实施前重新rg，不能照抄上轮概述中的简称。

## 10. Consumer/Admin UI 影响

- TASK-0401：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0402：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0403：Consumer—明确退款进度与权益何时失效；Admin—必须预览金额与当前有效Grant、原因、近期MFA及审计。
- TASK-0404：Consumer—输入格式提示与真实格式一致，失败后码仍可用；Admin—禁用批次不声称撤销已兑换权益。
- TASK-0405：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。

## 11. 详细执行步骤

执行每个已派发任务：基线和前置→保留失败用例→最小领域/合同改动→同步消费者→定向验证→记录失败恢复和交接。以下清单不自动授权连续执行整个阶段。

<a id="task-0401"></a>
### TASK-0401：统一授予与兑换的生命周期、锁与起算时间

- 目标：每种生命周期结果一致、无身份复活；暂停访问保持拒绝；不能用重试掩盖死锁。
- 问题证据：F08：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F08；权益/生命周期。
- 前置依赖：TASK-0102,TASK-0302；暂停/保留政策依赖D3。D3影响分支需确认；不依赖政策的平台disabled拒绝可先修
- 变更目录：`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/tests/m3_entitlement_ledger.sql`、`supabase/tests/t14_account_lifecycle.sql`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql`、`supabase/migrations/20260908103340_m3_dual_secret_redeem.sql`、`supabase/migrations/20260911124902_bill_03_redemption_v2_lifecycle.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0401`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 按冻结锁序重读平台/账户/identity lifecycle/Plan/暂停前置。
    2. 在锁后取授权时间并统一同Plan顺延、异Plan冲突、Free fallback和真永久规则。
    3. 同步Admin、兑换、Billing调用入口但禁止在HTTP复制算法。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0401-NEG`；保留disabled授予与paused账本增长反例并按D3明确期望。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0401-REC`；Plan归档/账户关闭/身份删除/管理员Grant/兑换与付款双连接交错。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：每种生命周期结果一致、无身份复活；暂停访问保持拒绝；不能用重试掩盖死锁。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：阻塞（需所列决策/外部授权；独立准备可执行）；实施测试状态NOT_RUN。

<a id="task-0402"></a>
### TASK-0402：拆分Provider观察更新和幂等结算动作

- 目标：最新权威观察可追溯；原单最多一次原Grant；已退款/人工最终结案不可被旧观察复活。
- 问题证据：F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F03；Order/Settlement/退款。
- 前置依赖：TASK-0301,TASK-0302,TASK-0304。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/_shared`、`supabase/functions/maintenance`、`packages/domain/src/contracts`、`docs/reference/contracts`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/_shared/afdian.ts`、`supabase/functions/maintenance/index.ts`、`packages/domain/src/contracts/billing.ts`、`docs/reference/contracts/admin.openapi.json`、`supabase/tests/bill_05_provider_verification_settlement.sql`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`、`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0402`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 移除任意Settlement存在即阻断新观察的控制结构，保留原始结算唯一性。
    2. 追加观察来源/时间/合同版本及可信优先级，只允许可恢复状态重核。
    3. finalized旧通知只返回历史动作，新退款/修正走独立补偿事件。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0402-NEG`；paid后failed仍paid/granted、failed→paid、review修复后仍被短路。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0402-REC`；乱序/重复观察、correction后旧paid重放、提交后断响应。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：最新权威观察可追溯；原单最多一次原Grant；已退款/人工最终结案不可被旧观察复活。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：本地实现完成；实施测试状态PASS（Provider/Staging/生产门槛仍NOT_RUN，见verification-record）。

<a id="task-0403"></a>
### TASK-0403：建立退款撤销拒付冲正与Grant补偿关联

- 目标：每个资金动作与权益效果可对应、幂等可恢复；原Order/Grant不删除；失败有人工队列。
- 问题证据：F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F03；Order/Settlement/退款。
- 前置依赖：TASK-0401,TASK-0402；D2/D3。D2未确认BLOCKED；只准备方案/fixture，禁止自动执行外部退款
- 变更目录：`supabase/functions/account-api`、`packages/domain/src/contracts`、`docs/reference/contracts`、`apps/admin/features/subscriptions`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/account-api/index.ts`、`packages/domain/src/contracts/billing.ts`、`packages/domain/src/contracts/api.ts`、`docs/reference/contracts/admin.openapi.json`、`apps/admin/features/subscriptions/platform-subscription-page.tsx`、`supabase/tests/bill_03_redemption_v2_lifecycle.sql`、`supabase/tests/bill_06_admin_billing_and_consumer_authorization.sql`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`、`supabase/migrations/20260911124902_bill_03_redemption_v2_lifecycle.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0403`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 增加独立资金处理事实和原交易/退款金额币种/脱敏证据/决策关联。
    2. 按D2通过已有correction链定位当前有效替代Grant，preview后原子撤销或修正，部分退款不自行猜比例。
    3. 区分等待Provider退款、外部已确认、本地权益待补偿、完成，退款确认按钮不能冒充发起渠道退款。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0403-NEG`；全额重复退款、超额/异币退款、错误原单、部分退款政策未定、correction链缺失。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0403-REC`；退款与Grant/两个退款/两个Admin会话并发，外部成功后DB失败。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：明确退款进度与权益何时失效。
- 管理员操作验收：必须预览金额与当前有效Grant、原因、近期MFA及审计。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter admin typecheck`
- `pnpm test:e2e:t12-r2`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：每个资金动作与权益效果可对应、幂等可恢复；原Order/Grant不删除；失败有人工队列。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：阻塞（需所列决策/外部授权；独立准备可执行）；实施测试状态NOT_RUN。

<a id="task-0404"></a>
### TASK-0404：统一已发行兑换码协议与两阶段交付验收

- 目标：只存hash/掩码；交付和兑换均有审计；测试只使用明显虚构码，真实码零日志/截图。
- 问题证据：F16：`packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F16；兑换码。
- 前置依赖：TASK-0102,TASK-0401。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`packages/domain/src`、`supabase/functions/account-api`、`packages/domain/src/contracts`、`docs/reference/contracts`、`apps/admin/features/redemption`、`packages/domain/tests`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`packages/domain/src/redemption.ts`、`supabase/functions/account-api/index.ts`、`packages/domain/src/contracts/api.ts`、`docs/reference/contracts/account.openapi.json`、`docs/reference/contracts/admin.openapi.json`、`apps/admin/features/redemption/platform-redemption-batches-page.tsx`、`packages/domain/tests/billing.test.ts`、`supabase/tests/bill_03_redemption_v2_lifecycle.sql`、`supabase/tests/bill_07_upgrade_compatibility.sql`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911124902_bill_03_redemption_v2_lifecycle.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0404`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 保持真实31默认及合法历史码/HMAC domain/key解释，列实际alphabet/规范化与文档差异。
    2. 统一服务端和UI normalize/validate/format，不凭旧文档重生成已发行码。
    3. 校验首次明文交付、receipt/session、确认激活、10分钟窗口、禁用不可复活、过期与失败不耗码。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0404-NEG`；生成响应丢失不能再导出明文、过期receipt/不同session确认拒绝；Unicode及旧码不误拒。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0404-REC`；同码抢兑、禁用与兑换、两管理员确认、轮换当前/前一key。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：输入格式提示与真实格式一致，失败后码仍可用。
- 管理员操作验收：禁用批次不声称撤销已兑换权益。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：只存hash/掩码；交付和兑换均有审计；测试只使用明显虚构码，真实码零日志/截图。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0405"></a>
### TASK-0405：把兑换与公开入口限流接入实际领域调用

- 目标：限流实际在请求路径生效，错误不泄露码/Key，固定窗口边界行为明确。
- 问题证据：F16：`packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101`；F13：`supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F16,F13；兑换码、Webhook安全。
- 前置依赖：TASK-0404,TASK-0305。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/account-api`、`supabase/functions/billing-webhook`、`packages/domain/src/contracts`、`docs/reference/contracts`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/account-api/index.ts`、`supabase/functions/billing-webhook/index.ts`、`packages/domain/src/contracts/errors.ts`、`docs/reference/contracts/account.openapi.json`、`docs/reference/contracts/admin.openapi.json`、`supabase/functions/account-api/index.test.ts`、`supabase/tests/t09_security_helpers.sql`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260907103848_security_helpers.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0405`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 复用原子数据库窗口计数器，键只用hash。
    2. 按现有合同实施兑换账户5/分钟、可信IP30/分钟、平台300/分钟及公开目录600/分钟，Webhook独立预算在0701冻结。
    3. 明确可信代理IP来源、超限429/Retry-After和限流失败不放行。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0405-NEG`；伪造Forwarded/XFF、跨平台共用键、超限仍Grant、计数器不可用。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0405-REC`；并发临界窗口/重复幂等请求的计数规则、清理不删业务绑定。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：限流实际在请求路径生效，错误不泄露码/Key，固定窗口边界行为明确。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
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

- [ ] TASK-0401：每种生命周期结果一致、无身份复活；暂停访问保持拒绝；不能用重试掩盖死锁。
- [x] TASK-0402：最新权威观察可追溯；原单最多一次原Grant；已退款/人工最终结案不可被旧观察复活。
- [ ] TASK-0403：每个资金动作与权益效果可对应、幂等可恢复；原Order/Grant不删除；失败有人工队列。
- [ ] TASK-0404：只存hash/掩码；交付和兑换均有审计；测试只使用明显虚构码，真实码零日志/截图。
- [ ] TASK-0405：限流实际在请求路径生效，错误不泄露码/Key，固定窗口边界行为明确。
- [ ] 前置未过不标完成；每项结果覆盖成功、失败、并发和恢复，不只HTTP200。
- [ ] 无已知P1在本阶段边界被隐藏；无放宽权限、删除测试或交易数据。
- [ ] SQL/API/SDK/BFF/UI/Registry相关消费者同步，兼容与回退实际验证。

## 15. 交接给下一阶段的输出

每任务提交给下一任务：具体文件diff、迁移实际顺序、合同版本/兼容窗口、前后失败证据、最后权威状态、风险/未验证项、回退停止点。参考[全局任务依赖表](../repair-matrices.md)。本轮禁止提交与推送；后续是否提交按届时用户授权，不能从历史附录继承。

## 16. 未完成事项和 NOT_RUN 项

TASK-0401、TASK-0403至TASK-0405仍未实施；所需真实Provider合同、D1/D2/D3、告警责任/阈值、外部备份目标、staging/生产授权按任务标注。文档静态通过不把本阶段标验收通过。修复后才将实际事实同步architecture/reference/guides，本轮只整理proposal。

历史阶段保留在[归档文件](../../../archive/subscription-billing-centralization/phases/03-billing-core-and-afdian-checkout.md)；只作来源，状态和派发规则不作为本次修复验收。
