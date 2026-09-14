# RC-02：目录、不可变Checkout合同与购买意图

## 1. 阶段名称和状态

状态：Proposed／计划中；本轮只制定计划，所有修复实现未开始。当前派发以 TASK ID 为准，文件名为历史兼容路径。旧BILL记录只通过末尾归档链接引用，不是当前验收状态或执行授权。

## 2. 阶段目标

- 冻结已发布mapping和完整Checkout核验快照（TASK-0201）。
- 建立服务端购买意图恢复及取消后迟到款规则（TASK-0202）。
- 按已确认Lifetime策略收敛双付款及购买资格（TASK-0203）。

## 3. 问题来源

[唯一问题表](../repair-issues.md)：F07,F09,F15；[总计划](../plan.md)与[矩阵](../repair-matrices.md)。不在本阶段重复维护问题状态。

## 4. 前置依赖

RC-01；TASK-0203受D1约束，其余独立。每个任务的前置比阶段概述更精确。依赖未过只做可独立准备；阶段集成验收必须前置全部满足。默认串行；计划不授权多Agent。

## 5. 明确不在本阶段处理的内容

不修改已付历史金额，不用最新mapping猜测旧snapshot。本轮只改proposal，不修改任何业务源码、迁移、配置、API、UI、测试，不commit/push。后续实现须另获任务派发。

## 6. 当前源码和配置证据

| 问题 | 基线证据 | 当前行为 |
| --- | --- | --- |
| F07 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:411; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:126; supabase/migrations/20260912150000_afdian_checkout_payment_link.sql:29` | 上轮将 mapping 从9.90改8.00不升版，8.00事实获 Grant，Checkout仍9.90；高权限配置触发 |
| F09 | `apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181` | 每次点击新UUID；成功响应后才持久化；取消仅清本地；Lifetime guard 与旧续购计划冲突，未完整分类异常 |
| F15 | `apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613` | 永久文案vs99年；只消费创建响应子集；同商品禁购；独立fetch未统一刷新；SDK目录方法无用户态输入 |

## 7. 修改文件清单

下列为未来实施候选，历史迁移只读；本轮仅该阶段计划文件发生文档改动。

- `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/migrations/20260912150000_afdian_checkout_payment_link.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/functions/account-api/index.ts`
- `packages/domain/src/contracts/billing.ts`
- `packages/domain/src/contracts/api.ts`
- `packages/domain/src/contracts/errors.ts`
- `docs/reference/contracts/account.openapi.json`
- `docs/reference/contracts/admin.openapi.json`
- `packages/account-server/src/index.ts`
- `apps/template-preview/app/api/v1/[...path]/route.ts`
- `apps/admin/app/api/v1/[...path]/route.ts`
- `supabase/tests/bill_04_checkout_order_inbox_jobs.sql`
- `supabase/tests/bill_12_afdian_checkout_payment_link.sql`
- `supabase/tests/bill_09_idempotency_cleanup.sql`
- `supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql`：只读旧定义；新增forward-fix代替编辑它。
- `supabase/tests/bill_19_lifetime_purchase_guard.sql`

## 8. 数据库迁移清单

| 任务 | 迁移需求 | 生成/依赖/升级约束 |
| --- | --- | --- |
| TASK-0201 | 新增forward-fix | 候选slug repair_task_0201；前置 TASK-0101,TASK-0102；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0202 | 新增forward-fix | 候选slug repair_task_0202；前置 TASK-0201,TASK-0101；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |
| TASK-0203 | 新增forward-fix | 候选slug repair_task_0203；前置 TASK-0201,TASK-0003(D1)；固定CLI 2.111.0生成；先schema扩展/领域过程及权限，再API，再消费者；不可删除历史交易。 |

所有迁移先核对 `pnpm exec supabase --version`、`pnpm exec supabase migration new --help`，再用 `pnpm exec supabase migration new <已审核slug>`。尖括号为占位不可原样执行；本轮不运行生成命令，不手造时间戳。确认前置迁移已应用、旧函数最后定义、依赖视图/触发器、DDL锁时间、回填批量/检查点和权限负例。远程schema变更需实际授权；不使用linked reset。迁移实际文件清单在执行时追加verification-record，不以候选slug计已生成。

## 9. API/OpenAPI/DTO/SDK 影响

逐任务列出的合同文件必须与[影响矩阵](../repair-matrices.md)一起验收。新增字段采用兼容扩展；不得静默更名现有跨模块字段，`/v1/plans`不改义。没有独立Admin SDK包，使用现有Admin请求封装与中央API DTO。函数名称和最新重定义在实施前重新rg，不能照抄上轮概述中的简称。

## 10. Consumer/Admin UI 影响

- TASK-0201：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0202：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。
- TASK-0203：Consumer—后端任务：以对应Consumer任务验证，不在本任务新增页面；用户不能看到虚假成功；Admin—后端任务：保留可追溯的错误/操作ID，由对应Admin任务呈现；不得任意写表。

## 11. 详细执行步骤

执行每个已派发任务：基线和前置→保留失败用例→最小领域/合同改动→同步消费者→定向验证→记录失败恢复和交接。以下清单不自动授权连续执行整个阶段。

<a id="task-0201"></a>
### TASK-0201：冻结已发布mapping和完整Checkout核验快照

- 目标：旧Checkout的付款链接与结算标准在发布新价后不变；客户端金额/期限/账户注入全部拒绝。
- 问题证据：F07：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:411; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:126; supabase/migrations/20260912150000_afdian_checkout_payment_link.sql:29`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F07；Catalog/Snapshot。
- 前置依赖：TASK-0101,TASK-0102。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/account-api`、`packages/domain/src/contracts`、`docs/reference/contracts`、`packages/account-server/src`、`apps/template-preview/app/api/v1/[...path]`、`apps/admin/app/api/v1/[...path]`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/account-api/index.ts`、`packages/domain/src/contracts/billing.ts`、`packages/domain/src/contracts/api.ts`、`packages/domain/src/contracts/errors.ts`、`docs/reference/contracts/account.openapi.json`、`docs/reference/contracts/admin.openapi.json`、`packages/account-server/src/index.ts`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`apps/admin/app/api/v1/[...path]/route.ts`、`supabase/tests/bill_04_checkout_order_inbox_jobs.sql`、`supabase/tests/bill_12_afdian_checkout_payment_link.sql`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`、`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`、`supabase/migrations/20260912150000_afdian_checkout_payment_link.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0201`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 通过新迁移建立published mapping不可变版本与当前指针约束。
    2. snapshot冻结provider/account、external plan/type、SKU全集/数量、实付/原价/币种、期限、price/mapping版本、custom order与归属。
    3. 付款链接及核验读取同一旧snapshot，旧行无法证明的合同列入人工隔离而非猜测回填；另列Plan features/quota当前动态策略与历史购买证据的区别，未经政策决定不冻结或重解释旧配额。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0201-NEG`；保留9.90 Checkout改mapping8.00仍授予反例，改版后必须拒绝不符事实。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0201-REC`；发布/调价/Plan切换和创建并发；旧链接迟到、轮换旧key恢复。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
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

- 预期结果：旧Checkout的付款链接与结算标准在发布新价后不变；客户端金额/期限/账户注入全部拒绝。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0202"></a>
### TASK-0202：建立服务端购买意图恢复及取消后迟到款规则

- 目标：同一意图最多一个Checkout；未知结果可查询；同Checkout两笔钱均保留但只一笔自动Grant。
- 问题证据：F09：`apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181`；F05：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F09,F05；Checkout幂等、Checkout/Consumer。
- 前置依赖：TASK-0201,TASK-0101。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`supabase/functions/account-api`、`packages/domain/src/contracts`、`docs/reference/contracts`、`packages/account-server/src`、`apps/template-preview/app/api/v1/[...path]`、`apps/admin/app/api/v1/[...path]`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/account-api/index.ts`、`packages/domain/src/contracts/billing.ts`、`packages/domain/src/contracts/api.ts`、`packages/domain/src/contracts/errors.ts`、`docs/reference/contracts/account.openapi.json`、`docs/reference/contracts/admin.openapi.json`、`packages/account-server/src/index.ts`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`apps/admin/app/api/v1/[...path]/route.ts`、`supabase/tests/bill_04_checkout_order_inbox_jobs.sql`、`supabase/tests/bill_09_idempotency_cleanup.sql`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0202`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 同scope/key长期绑定校验request_hash并返回当前状态，独立于短期缓存。
    2. 设计认证后的当前账户待处理意图查询和最小恢复信息，过期/已付不再签发可付链接。
    3. 明确本地取消不等于Provider取消，保存迟到paid并进入结算或人工流程。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0202-NEG`；同key异参数、清理7天缓存后重放、非本人获取intent、granted降expired。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0202-REC`；提交后断响应再请求同key；跨Tab不同key；取消后外部成功。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
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

- 预期结果：同一意图最多一个Checkout；未知结果可查询；同Checkout两笔钱均保留但只一笔自动Grant。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0203"></a>
### TASK-0203：按已确认Lifetime策略收敛双付款及购买资格

- 目标：既不丢第二笔钱也不通过删测试偷偷改变商业规则；购买资格与已确认政策一致。
- 问题证据：F09：`apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F09,F15；Checkout幂等、Consumer/SDK。
- 前置依赖：TASK-0201,TASK-0003(D1)。D1未确认时BLOCKED；独立异常隔离方案可先设计
- 变更目录：`supabase/functions/account-api`、`packages/domain/src/contracts`、`docs/reference/contracts`、`packages/account-server/src`、`apps/template-preview/app/api/v1/[...path]`、`apps/admin/app/api/v1/[...path]`、`supabase/tests`；`supabase/migrations`（仅新增）。
- 变更文件：`supabase/functions/account-api/index.ts`、`packages/domain/src/contracts/billing.ts`、`packages/domain/src/contracts/api.ts`、`packages/domain/src/contracts/errors.ts`、`docs/reference/contracts/account.openapi.json`、`docs/reference/contracts/admin.openapi.json`、`packages/account-server/src/index.ts`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`apps/admin/app/api/v1/[...path]/route.ts`、`supabase/tests/bill_19_lifetime_purchase_guard.sql`。历史迁移仅作只读定义来源，不可修改：`supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql`、`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql`。
- 是否涉及数据库迁移：是；候选 migration slug `repair_task_0203`，用固定CLI生成真实时间戳，列出最终函数及约束diff后方可执行。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：是，操作结果与权限反馈同步。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；新函数owner/search_path/REVOKE/GRANT及RLS负向必须齐全，不能扩大executor任意DML。
- 实施步骤：

    1. 保留当前一次购买限制直到D1明确。
    2. 若保留一次购买，第二笔paid写duplicate/manual处理且不无限抛错。
    3. 若授权恢复有限续购，以forward-fix同步guard、资格读取、SDK与UI，并保留旧策略回归历史。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0203-NEG`；两pending均paid时无无限retry；Admin真永久和有限99年区分。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0203-REC`；两笔Lifetime并发、跨商品续期、撤销后旧单重放。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
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

- 预期结果：既不丢第二笔钱也不通过删测试偷偷改变商业规则；购买资格与已确认政策一致。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：采用expand-first；停止本任务新动作/必要时关闭新购买，继续保存已付款入站；回退到兼容且不含已知漏洞的应用版本，保留新增表/列/Order/Grant/幂等及审计，另发forward-fix。不得down删除账本或重写旧迁移。
- 完成状态：阻塞（需所列决策/外部授权；独立准备可执行）；实施测试状态NOT_RUN。

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

- [ ] TASK-0201：旧Checkout的付款链接与结算标准在发布新价后不变；客户端金额/期限/账户注入全部拒绝。
- [ ] TASK-0202：同一意图最多一个Checkout；未知结果可查询；同Checkout两笔钱均保留但只一笔自动Grant。
- [ ] TASK-0203：既不丢第二笔钱也不通过删测试偷偷改变商业规则；购买资格与已确认政策一致。
- [ ] 前置未过不标完成；每项结果覆盖成功、失败、并发和恢复，不只HTTP200。
- [ ] 无已知P1在本阶段边界被隐藏；无放宽权限、删除测试或交易数据。
- [ ] SQL/API/SDK/BFF/UI/Registry相关消费者同步，兼容与回退实际验证。

## 15. 交接给下一阶段的输出

每任务提交给下一任务：具体文件diff、迁移实际顺序、合同版本/兼容窗口、前后失败证据、最后权威状态、风险/未验证项、回退停止点。参考[全局任务依赖表](../repair-matrices.md)。本轮禁止提交与推送；后续是否提交按届时用户授权，不能从历史附录继承。

## 16. 未完成事项和 NOT_RUN 项

全部TASK尚未实施；所需真实Provider合同、D1/D2/D3、告警责任/阈值、外部备份目标、staging/生产授权按任务标注。文档静态通过不把本阶段标验收通过。修复后才将实际事实同步architecture/reference/guides，本轮只整理proposal。

历史阶段保留在[归档文件](../../../archive/subscription-billing-centralization/phases/02-redemption-v2-and-term-semantics.md)；只作来源，状态和派发规则不作为本次修复验收。
