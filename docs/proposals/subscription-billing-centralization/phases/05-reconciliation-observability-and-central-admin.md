# RC-07：主动对账、cron、告警与恢复

## 1. 阶段名称和状态

状态：Proposed／计划中；本轮只制定计划，所有修复实现未开始。当前派发以 TASK ID 为准，文件名为历史兼容路径。旧BILL记录只通过末尾归档链接引用，不是当前验收状态或执行授权。

## 2. 阶段目标

- 实现独立分页发现和双进度对账（TASK-0701）。
- 用forward-fix修正cron契约与批次运行结果（TASK-0702）。
- 建立积压失联与资金权益差异告警（TASK-0703）。
- 制定并演练Secret轮换和Provider事故止损（TASK-0704）。
- 核实所有维护调用方及环境角色网关差异（TASK-0705）。
- 验证外部对象备份、恢复屏障与交易恢复（TASK-0706）。

## 3. 问题来源

[唯一问题表](../repair-issues.md)：F02,F06,F13,F14,F16,F17；[总计划](../plan.md)与[矩阵](../repair-matrices.md)。不在本阶段重复维护问题状态。

## 4. 前置依赖

RC-03；退款差异依赖RC-04；无需等UI完成可先执行。每个任务的前置比阶段概述更精确。依赖未过只做可独立准备；阶段集成验收必须前置全部满足。默认串行；计划不授权多Agent。

## 5. 明确不在本阶段处理的内容

不因schedule.json存在宣称运行，不未经授权配置远程Secret/开关或恢复。本轮只改proposal，不修改任何业务源码、迁移、配置、API、UI、测试，不commit/push。后续实现须另获任务派发。

## 6. 当前源码和配置证据

| 问题 | 基线证据 | 当前行为 |
| --- | --- | --- |
| F02 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:532,562; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:59; supabase/functions/maintenance/index.ts:655,699` | claim 只 pending/retryable；lease deadline 未统一校验；上轮 expired processing reclaimed=0；重试固定一分钟无上限 |
| F06 | `supabase/functions/_shared/afdian.ts:255; supabase/functions/maintenance/index.ts:792; supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:457` | 当前 discovery 使用 Webhook 已知订单号；游标过程存在不等于有主动扫描调用方 |
| F13 | `supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235` | RSA canonical不包含status但event key包含；同事件不同hash冲突；通用HMAC header绑定须检查 |
| F14 | `supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195` | Vault缺值直接return；不跟踪pg_net结果；5秒HTTP处理5个顺序任务；processing未完整统计；路径必须含maintenance函数前缀 |
| F16 | `packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101` | 文档26载荷/AISEN前缀与实际31默认不同；Unicode空白规范化不同；未找到窗口限流调用；交付/过期/禁用需保留负向验收 |
| F17 | `.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1` | CI非部署且缺完整SQL/Edge/E2E门槛；历史Local/Staging叙述冲突；外部对象备份/恢复未证实；格式等历史失败须保留 |

## 7. 修改文件清单

下列为未来实施候选，历史迁移只读；本轮仅该阶段计划文件发生文档改动。

- `supabase/functions/_shared/afdian.ts`
- `supabase/functions/maintenance/index.ts`
- `supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql`：只读旧定义；新增forward-fix代替编辑它。
- `packages/domain/src/contracts/billing.ts`
- `supabase/functions/_shared/afdian.test.ts`
- `supabase/functions/maintenance/index.test.ts`
- `supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/functions/maintenance/schedule.json`
- `supabase/config.toml`
- `docs/reference/configuration.md`
- `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/functions/account-api/index.ts`
- `docs/reference/contracts/admin.openapi.json`
- `apps/admin/features/operations/operations-center-page.tsx`
- `docs/guides/operations.md`
- `supabase/functions/_shared/billing.ts`
- `supabase/migrations/20260912143000_hosted_runtime_role_membership.sql`：只读旧定义；新增forward-fix代替编辑它。
- `docs/architecture/deployment.md`
- `supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/migrations/20260908185521_m4_09_backup_barrier_guard.sql`：只读旧定义；新增forward-fix代替编辑它。
- `tests/spikes/ops/m6-02-local-backup.mjs`
- `supabase/tests/m6_02_backup_barrier_protocol.sql`

## 8. 数据库迁移清单

| 任务 | 迁移需求 | 生成/依赖/升级约束 |
| --- | --- | --- |
| TASK-0701 | 新增forward-fix | 候选slug repair_task_0701；前置 TASK-0301,TASK-0302,TASK-0304,TASK-0201；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0702 | 新增forward-fix | 候选slug repair_task_0702；前置 TASK-0002,TASK-0302,TASK-0303；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0703 | 新增forward-fix | 候选slug repair_task_0703；前置 TASK-0701,TASK-0702,TASK-0402；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0704 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0705 | 新增forward-fix | 候选slug repair_task_0705；前置 TASK-0002,TASK-0702；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0706 | 新增forward-fix | 候选slug repair_task_0706；前置 TASK-0401,TASK-0402,TASK-0705；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |

所有迁移先核对 `pnpm exec supabase --version`、`pnpm exec supabase migration new --help`，再用 `pnpm exec supabase migration new <已审核slug>`。尖括号为占位不可原样执行；本轮不运行生成命令，不手造时间戳。确认前置迁移已应用、旧函数最后定义、依赖视图/触发器、DDL锁时间、回填批量/检查点和权限负例。远程schema变更需实际授权；不使用linked reset。迁移实际文件清单在执行时追加verification-record，不以候选slug计已生成。

## 9. API/OpenAPI/DTO/SDK 影响

逐任务列出的合同文件必须与[影响矩阵](../repair-matrices.md)一起验收。新增字段采用兼容扩展；不得静默更名现有跨模块字段，`/v1/plans`不改义。没有独立Admin SDK包，使用现有Admin请求封装与中央API DTO。函数名称和最新重定义在实施前重新rg，不能照抄上轮概述中的简称。

## 10. Consumer/Admin UI 影响

- TASK-0701：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0702：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0703：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0704：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0705：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0706：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。

## 11. 详细执行步骤

执行每个已派发任务：基线和前置→保留失败用例→最小领域/合同改动→同步消费者→定向验证→记录失败恢复和交接。以下清单不自动授权连续执行整个阶段。

<a id="task-0701"></a>
### TASK-0701：实现独立分页发现和双进度对账

- 目标：漏通知可在明确SLA补回；单个订单已知不代表整页完成；旧失败不因游标前进消失。
- 问题证据：F06：`supabase/functions/_shared/afdian.ts:255; supabase/functions/maintenance/index.ts:792; supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:457`；F12：`supabase/functions/_shared/afdian.ts:358,365,378,441,452; packages/domain/src/contracts/billing.ts:98`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F06,F12；对账、Provider合同。
- 前置依赖：TASK-0301,TASK-0302,TASK-0304,TASK-0201。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/_shared`、`supabase/functions/maintenance`、`packages/domain/src/contracts`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/_shared/afdian.ts`、`supabase/functions/maintenance/index.ts`、`packages/domain/src/contracts/billing.ts`、`supabase/functions/_shared/afdian.test.ts`、`supabase/functions/maintenance/index.test.ts`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0701`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 固定Provider分页/历史可查合同并配置头部预算、重叠窗口、续扫checkpoint和周期深扫。
    2. 先持久化订单线索再推进发现进度，处理队列独立于发现游标。
    3. 按provider account/order唯一去重，经权威核验和原结算入口处理，冻结429/并发/时间预算。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0701-NEG`；完全无Webhook仍能发现paid；页移动/迟到老订单/page cap不漏。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0701-REC`；Webhook与扫描并发、游标提交前后崩溃、旧fence推进拒绝。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：漏通知可在明确SLA补回；单个订单已知不代表整页完成；旧失败不因游标前进消失。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0702"></a>
### TASK-0702：用forward-fix修正cron契约与批次运行结果

- 目标：记录scheduler调用、受理和业务完成三层结果，processing可恢复；不随意放开verify_jwt以过网关。
- 问题证据：F14：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F14；cron/观测。
- 前置依赖：TASK-0002,TASK-0302,TASK-0303。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/maintenance`、`supabase`、`docs/reference`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/maintenance/index.ts`、`supabase/functions/maintenance/schedule.json`、`supabase/functions/maintenance/index.test.ts`、`supabase/config.toml`、`docs/reference/configuration.md`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0702`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 新增迁移修正readiness/调用记录，不改BILL-16历史文件。
    2. 规范Local基址含/maintenance，Hosted基址含/functions/v1/maintenance，追加/v1/billing/jobs/run并实测网关后的pathname。
    3. 跟踪pg_net request ID/HTTP结果和批次成功失败数，协调lease/Provider/批次/网关预算，缺Secret明确未就绪而非健康。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0702-NEG`；base重复或缺maintenance产生404、错误token401、缺Vault、5秒超时、内部503被200掩盖。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0702-REC`；每分钟重叠批次、密钥错配、禁用/恢复期间已有Job接管。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm test:maintenance`
- `pnpm test:ops:m6-02-local`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：记录scheduler调用、受理和业务完成三层结果，processing可恢复；不随意放开verify_jwt以过网关。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0703"></a>
### TASK-0703：建立积压失联与资金权益差异告警

- 目标：对故意停机/坏配置/漏Webhook/退款不一致能检测、送达、恢复；阈值决策未定不标PASS。
- 问题证据：F14：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195`；F06：`supabase/functions/_shared/afdian.ts:255; supabase/functions/maintenance/index.ts:792; supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:457`；F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F14,F06,F03；cron/观测、对账、Order/Settlement/退款。
- 前置依赖：TASK-0701,TASK-0702,TASK-0402。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/maintenance`、`supabase/functions/account-api`、`docs/reference/contracts`、`apps/admin/features/operations`、`docs/guides`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/maintenance/index.ts`、`supabase/functions/account-api/index.ts`、`docs/reference/contracts/admin.openapi.json`、`apps/admin/features/operations/operations-center-page.tsx`、`supabase/functions/maintenance/index.test.ts`、`docs/guides/operations.md`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0703`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 指标覆盖所有Job状态、oldest年龄、过期lease、重试次数、manual/duplicate及退款待补偿。
    2. 独立记录discovery/processing最近业务成功，固定SLA/阈值/责任岗位与升级路径。
    3. 告警记录去重和恢复事件，验证接收端实际送达，不以日志存在代替。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0703-NEG`；调度绿但业务零完成、失联processing不计数、退款差异未告警。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0703-REC`；持续失败合并告警、恢复后再故障、告警接收失败。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `pnpm test:maintenance`
- `pnpm test:ops:m6-02-local`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：对故意停机/坏配置/漏Webhook/退款不一致能检测、送达、恢复；阈值决策未定不标PASS。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0704"></a>
### TASK-0704：制定并演练Secret轮换和Provider事故止损

- 目标：新旧窗口和撤销时间可证明；开关独立；远程动作无授权保持BLOCKED。
- 问题证据：F13：`supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235`；F14：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195`；F16：`packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101`；F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F13,F14,F16,F17；Webhook安全、cron/观测、兑换码、环境/CI/备份/文档。
- 前置依赖：TASK-0702,TASK-0404,TASK-0305。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/maintenance`、`supabase/functions/_shared`、`docs/guides`、`docs/reference`。
- 变更文件：`supabase/functions/maintenance/index.ts`、`supabase/functions/_shared/afdian.ts`、`supabase/functions/_shared/billing.ts`、`docs/guides/operations.md`、`docs/reference/configuration.md`、`supabase/functions/maintenance/index.test.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 分别列Checkout HMAC当前/旧版、兑换HMAC双密钥、Provider API Token、Webhook公钥/路径防护、Edge/Vault Worker Token和Platform Key轮换。
    2. 按短重叠窗口更新与确认旧版本恢复，不记录真实值。
    3. 演练仅关新购买继续已付款入站，必要时停结算但保留任务及对账，Provider事故由责任人处理。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0704-NEG`；旧key窗口内恢复失败、旧Token超窗仍接受、日志输出Secret、购买关闭误关Webhook。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0704-REC`；Edge/Vault先后更新、在途query、轮换时恢复旧Checkout、stop/restart积压。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm test:maintenance`
- `pnpm test:ops:m6-02-local`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：新旧窗口和撤销时间可证明；开关独立；远程动作无授权保持BLOCKED。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0705"></a>
### TASK-0705：核实所有维护调用方及环境角色网关差异

- 目标：每个入口有调用方/频率/预算/责任/证据，未知显式NOT_RUN；不把共享postgres回退当最小凭据。
- 问题证据：F14：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195`；F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F14,F17；cron/观测、环境/CI/备份/文档。
- 前置依赖：TASK-0002,TASK-0702。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/maintenance`、`supabase`、`docs/architecture`、`docs/reference`、`docs/guides`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/maintenance/index.ts`、`supabase/functions/maintenance/schedule.json`、`supabase/config.toml`、`docs/architecture/deployment.md`、`docs/reference/configuration.md`、`docs/guides/operations.md`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260912143000_hosted_runtime_role_membership.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0705`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 逐一登记Billing run/discover、文件cleanup/reconcile、idempotency cleanup、retention、删除任务和备份的实际调用方。
    2. 建立Local/Staging/Production版本、路径、网关JWT、Origin/callback、executor、Secret configured状态矩阵。
    3. 对不在当前业务范围的运行缺口仅给准备和门槛，不擅自安装新服务或扩大角色。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0705-NEG`；本地超级用户能SET ROLE但Hosted失败、任务入口存在无人调度、路径缺前缀。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0705-REC`；调度重复安装、角色回退、网关版本切换、并发维护与Billing。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm test:maintenance`
- `pnpm test:ops:m6-02-local`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：每个入口有调用方/频率/预算/责任/证据，未知显式NOT_RUN；不把共享postgres回退当最小凭据。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0706"></a>
### TASK-0706：验证外部对象备份、恢复屏障与交易恢复

- 目标：DB+实际对象可恢复且删除不复活；RPO/RTO、残留和对账差异有实测，外部目标缺失BLOCKED。
- 问题证据：F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`；F08：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48`；F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F17,F08,F03；环境/CI/备份/文档、权益/生命周期、Order/Settlement/退款。
- 前置依赖：TASK-0401,TASK-0402,TASK-0705。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`tests/spikes/ops`、`supabase/tests`、`docs/guides`；`supabase/migrations`（仅新增）。
- 变更文件：`tests/spikes/ops/m6-02-local-backup.mjs`、`supabase/tests/m6_02_backup_barrier_protocol.sql`、`docs/guides/operations.md`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql`、`supabase/migrations/20260908185521_m4_09_backup_barrier_guard.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0706`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 核验独立备份目标、加密/访问/保留、DB与实际Storage对象清单及一致checkpoint。
    2. 隔离恢复后先重放删除屏障/墓碑再开放读取，恢复自定义角色凭据仅通过Secret通道。
    3. 对恢复区间Provider事实重新对账，保留订单去重与correction链，不因恢复重复Grant。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0706-NEG`；只备metadata未备对象、删除用户恢复复活、旧订单再次结算、未知外部写丢失。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0706-REC`；Storage成功DB失败、备份进行中删除/上传/付款、恢复后迟到Webhook。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功。
- 管理员操作验收：后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm test:db`
- `pnpm run test:sql:bill-05-concurrency`
- `pnpm test:maintenance`
- `pnpm test:ops:m6-02-local`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：DB+实际对象可恢复且删除不复活；RPO/RTO、残留和对账差异有实测，外部目标缺失BLOCKED。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
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

- [ ] TASK-0701：漏通知可在明确SLA补回；单个订单已知不代表整页完成；旧失败不因游标前进消失。
- [ ] TASK-0702：记录scheduler调用、受理和业务完成三层结果，processing可恢复；不随意放开verify_jwt以过网关。
- [ ] TASK-0703：对故意停机/坏配置/漏Webhook/退款不一致能检测、送达、恢复；阈值决策未定不标PASS。
- [ ] TASK-0704：新旧窗口和撤销时间可证明；开关独立；远程动作无授权保持BLOCKED。
- [ ] TASK-0705：每个入口有调用方/频率/预算/责任/证据，未知显式NOT_RUN；不把共享postgres回退当最小凭据。
- [ ] TASK-0706：DB+实际对象可恢复且删除不复活；RPO/RTO、残留和对账差异有实测，外部目标缺失BLOCKED。
- [ ] 前置未过不标完成；每项结果覆盖成功、失败、并发和恢复，不只HTTP200。
- [ ] 无已知P1在本阶段边界被隐藏；无放宽权限、删除测试或交易数据。
- [ ] SQL/API/SDK/BFF/UI/Registry相关消费者同步，兼容与回退实际验证。

## 15. 交接给下一阶段的输出

每任务提交给下一任务：具体文件diff、迁移实际顺序、合同版本/兼容窗口、前后失败证据、最后权威状态、风险/未验证项、回退停止点。参考[全局任务依赖表](../repair-matrices.md)。本轮禁止提交与推送；后续是否提交按届时用户授权，不能从历史附录继承。

## 16. 未完成事项和 NOT_RUN 项

全部TASK尚未实施；所需真实Provider合同、D1/D2/D3、告警责任/阈值、外部备份目标、staging/生产授权按任务标注。文档静态通过不把本阶段标验收通过。修复后才将实际事实同步architecture/reference/guides，本轮只整理proposal。

历史阶段保留在[归档文件](../../../archive/subscription-billing-centralization/phases/05-reconciliation-observability-and-central-admin.md)；只作来源，状态和派发规则不作为本次修复验收。
