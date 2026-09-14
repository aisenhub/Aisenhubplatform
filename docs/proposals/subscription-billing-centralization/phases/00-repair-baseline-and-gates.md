# RC-00：基线、工作区与决策门槛

## 1. 阶段名称和状态

状态：Proposed／执行中；TASK-0001 已完成本地基线冻结，TASK-0002/0003 仍受运行配置与业务策略门槛影响。当前派发以 TASK ID 为准，文件名为历史兼容路径。旧BILL记录只通过末尾归档链接引用，不是当前验收状态或执行授权。

## 2. 阶段目标

- 冻结修复执行基线和工作区所有权（TASK-0001）。
- 审查BILL-16路径、权限和运行配置门槛（TASK-0002）。
- 登记并冻结续购、退款、暂停与保留策略决策（TASK-0003）。

## 3. 问题来源

[唯一问题表](../repair-issues.md)：F14,F17,F09；[总计划](../plan.md)与[矩阵](../repair-matrices.md)。不在本阶段重复维护问题状态。

## 4. 前置依赖

无；只读准备可立即派发。每个任务的前置比阶段概述更精确。依赖未过只做可独立准备；阶段集成验收必须前置全部满足。默认串行；计划不授权多Agent。

## 5. 明确不在本阶段处理的内容

不执行迁移、配置写入、真实付款或代码修复。本轮只改proposal，不修改任何业务源码、迁移、配置、API、UI、测试，不commit/push。后续实现须另获任务派发。

## 6. 当前源码和配置证据

| 问题 | 基线证据 | 当前行为 |
| --- | --- | --- |
| F09 | `apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181` | 每次点击新UUID；成功响应后才持久化；取消仅清本地；Lifetime guard 与旧续购计划冲突，未完整分类异常 |
| F14 | `supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195` | Vault缺值直接return；不跟踪pg_net结果；5秒HTTP处理5个顺序任务；processing未完整统计；路径必须含maintenance函数前缀 |
| F17 | `.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1` | CI非部署且缺完整SQL/Edge/E2E门槛；历史Local/Staging叙述冲突；外部对象备份/恢复未证实；格式等历史失败须保留 |

## 7. 修改文件清单

下列为未来实施候选，历史迁移只读；本轮仅该阶段计划文件发生文档改动。

- `docs/proposals/subscription-billing-centralization/verification-record.md`
- `docs/proposals/subscription-billing-centralization/repair-issues.md`
- `docs/proposals/subscription-billing-centralization/repair-matrices.md`
- `docs/proposals/subscription-billing-centralization/design.md`
- `docs/proposals/subscription-billing-centralization/plan.md`

## 8. 数据库迁移清单

| 任务 | 迁移需求 | 生成/依赖/升级约束 |
| --- | --- | --- |
| TASK-0001 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0002 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0003 | 无 | 不改数据库；若需求变化先修计划。 |

所有迁移先核对 `pnpm exec supabase --version`、`pnpm exec supabase migration new --help`，再用 `pnpm exec supabase migration new <已审核slug>`。尖括号为占位不可原样执行；本轮不运行生成命令，不手造时间戳。确认前置迁移已应用、旧函数最后定义、依赖视图/触发器、DDL锁时间、回填批量/检查点和权限负例。远程schema变更需实际授权；不使用linked reset。迁移实际文件清单在执行时追加verification-record，不以候选slug计已生成。

## 9. API/OpenAPI/DTO/SDK 影响

逐任务列出的合同文件必须与[影响矩阵](../repair-matrices.md)一起验收。新增字段采用兼容扩展；不得静默更名现有跨模块字段，`/v1/plans`不改义。没有独立Admin SDK包，使用现有Admin请求封装与中央API DTO。函数名称和最新重定义在实施前重新rg，不能照抄上轮概述中的简称。

## 10. Consumer/Admin UI 影响

- TASK-0001：Consumer—不访问既有登录会话的购买操作；Admin—只读核对中央管理员模型，不新增管理员。
- TASK-0002：Consumer—已有付款继续入站的止损边界明确；Admin—提供失败原因与负责岗位字段。
- TASK-0003：Consumer—不得承诺永久或擅自开放续购；Admin—人工不通过伪造账户或改原价处理异常。

## 11. 详细执行步骤

执行每个已派发任务：基线和前置→保留失败用例→最小领域/合同改动→同步消费者→定向验证→记录失败恢复和交接。以下清单不自动授权连续执行整个阶段。

<a id="task-0001"></a>
### TASK-0001：冻结修复执行基线和工作区所有权

- 目标：产出可执行基线、文件所有权表、实际命令表；不以历史PASS抵消反例。
- 问题证据：F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F17；环境/CI/备份/文档。
- 前置依赖：无。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`docs/proposals/subscription-billing-centralization`。
- 变更文件：`docs/proposals/subscription-billing-centralization/verification-record.md`、`docs/proposals/subscription-billing-centralization/repair-issues.md`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 读取规定文档、全部phases和phase-2并记录HEAD/branch/status。
    2. 仅列出已有未提交迁移/配置路径及归属，不打印内容和Secret。
    3. 核对现有命令真实入口、测试环境防误连守卫和上轮反例的可移植步骤。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0001-NEG`；保留上轮NULL授予、expired lease、未关联NOT NULL、resolve重放失败结果。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0001-REC`；不运行写DB探针；发现环境指向staging时阻止本地runner，不修改环境文件。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：不访问既有登录会话的购买操作。
- 管理员操作验收：只读核对中央管理员模型，不新增管理员。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：产出可执行基线、文件所有权表、实际命令表；不以历史PASS抵消反例。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。 本基线准备只改记录；不得回退用户已有文件。
- 完成状态：本地基线冻结完成；实施测试状态 PASS（本任务不运行写DB/Provider/远程环境探针）。

<a id="task-0002"></a>
### TASK-0002：审查BILL-16路径、权限和运行配置门槛

- 目标：配置值只记configured/missing/未核验；远程运行仍NOT_RUN；路径不能只做字符串比较验收。
- 问题证据：F14：`supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql:33,39,47; supabase/functions/maintenance/index.ts:892,973,1044; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:195`；F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F14,F17；cron/观测、环境/CI/备份/文档。
- 前置依赖：TASK-0001。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`docs/proposals/subscription-billing-centralization`。
- 变更文件：`docs/proposals/subscription-billing-centralization/verification-record.md`、`docs/proposals/subscription-billing-centralization/repair-matrices.md`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 核对BILL-16已跟踪及提交639dd6a，列出cron拼接和maintenance handler路径。
    2. 分别画出Local与Hosted网关后的pathname以及Vault函数基址规范。
    3. 列出JWT网关、自定义Job Token、executor SET ROLE、扩展、5秒预算、缺Secret和pg_net结果检查清单；静态核对发现历史 cron URL 依赖 Vault 基址是否已含 `/maintenance`，不能仅凭字符串或历史 staging 记录判定可用。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0002-NEG`；计划401/404/缺Vault/内部503测试，不假设官方示例的publishable key可替代本项目Worker Token。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0002-REC`；列出5任务顺序耗时大于5秒、密钥轮换不同步、重启时租约处理验证点。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：已有付款继续入站的止损边界明确。
- 管理员操作验收：提供失败原因与负责岗位字段。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：配置值只记configured/missing/未核验；远程运行仍NOT_RUN；路径不能只做字符串比较验收。当前维护函数真实入口为 `/maintenance/v1/billing/jobs/run`，历史 cron 迁移拼接 `/v1/billing/jobs/run` 的可用性依赖未核验 Vault 基址；修复需后续 forward-fix 和 Hosted HTTP/pg_net 证据。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。 本基线准备只改记录；不得回退用户已有文件。
- 完成状态：本地静态门槛审查完成；实施测试状态 PARTIAL（Hosted 配置、pg_net结果、真实HTTP与恢复演练 BLOCKED/NOT_RUN）。

<a id="task-0003"></a>
### TASK-0003：登记并冻结续购、退款、暂停与保留策略决策

- 目标：每个决策有明确选择、理由、授权来源、消费者列表才解除对应阻塞；本轮保持待决。
- 问题证据：F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`；F08：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48`；F09：`apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`；F17：`.github/workflows/workflow.yml:1; docs/guides/operations.md:7,70,76; supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql:1`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F03,F08,F09,F15,F17；Order/Settlement/退款、权益/生命周期、Checkout幂等、Consumer/SDK、环境/CI/备份/文档。
- 前置依赖：TASK-0001。D1/D2/D3待业务确认；本任务准备可执行，决策完成不可由超时推断
- 变更目录：`docs/proposals/subscription-billing-centralization`。
- 变更文件：`docs/proposals/subscription-billing-centralization/design.md`、`docs/proposals/subscription-billing-centralization/plan.md`、`docs/proposals/subscription-billing-centralization/repair-matrices.md`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：不直接修改；通过后续对应任务验收。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. D1比较旧99年可续购目标与BILL-19一次购买当前行为，形成两个方案及钱款/旧单影响。
    2. D2明确全额/部分退款、拒付、人工退款证据与权益修正规则，D3明确暂停起算/删除保留和职责。
    3. 把需业务选择的依赖标BLOCKED，仅继续不依赖选择的fail-closed/租约修复。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0003-NEG`；不得删BILL-19测试来恢复旧方案；不得以未决定退款比例写自动缩短算法。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0003-REC`；每个方案列两笔paid、暂停并发、已删除身份迟到付款及correction链竞争。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：不得承诺永久或擅自开放续购。
- 管理员操作验收：人工不通过伪造账户或改原价处理异常。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：每个决策有明确选择、理由、授权来源、消费者列表才解除对应阻塞；本轮保持待决。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。 本基线准备只改记录；不得回退用户已有文件。
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

- [ ] TASK-0001：产出可执行基线、文件所有权表、实际命令表；不以历史PASS抵消反例。
- [ ] TASK-0002：配置值只记configured/missing/未核验；远程运行仍NOT_RUN；路径不能只做字符串比较验收。
- [ ] TASK-0003：每个决策有明确选择、理由、授权来源、消费者列表才解除对应阻塞；本轮保持待决。
- [ ] 前置未过不标完成；每项结果覆盖成功、失败、并发和恢复，不只HTTP200。
- [ ] 无已知P1在本阶段边界被隐藏；无放宽权限、删除测试或交易数据。
- [ ] SQL/API/SDK/BFF/UI/Registry相关消费者同步，兼容与回退实际验证。

## 15. 交接给下一阶段的输出

每任务提交给下一任务：具体文件diff、迁移实际顺序、合同版本/兼容窗口、前后失败证据、最后权威状态、风险/未验证项、回退停止点。参考[全局任务依赖表](../repair-matrices.md)。本轮禁止提交与推送；后续是否提交按届时用户授权，不能从历史附录继承。

## 16. 未完成事项和 NOT_RUN 项

全部TASK尚未实施；所需真实Provider合同、D1/D2/D3、告警责任/阈值、外部备份目标、staging/生产授权按任务标注。文档静态通过不把本阶段标验收通过。修复后才将实际事实同步architecture/reference/guides，本轮只整理proposal。
