# 订阅支付审查修复总计划

状态：**执行中**。TASK-0001 已完成本地基线冻结，TASK-0002 完成本地静态门槛审查，TASK-0702 已完成本地 forward-fix 与回归，TASK-0101/0103、TASK-0301～0306、TASK-0402、TASK-0601/0603/0605/0609 已完成本地实现或回归，TASK-0602 已完成本地权限/跨平台隔离回归与 forward-fix，TASK-0102 已完成共享授予入口的平台禁用与 Global Delete identity barrier 局部 forward-fix 及 Local 回归；Hosted 配置、Provider、Staging、生产和真实支付仍未完成。计划完整不代表功能完成。

本文件是本次修复的唯一总计划。[问题唯一清单](repair-issues.md) · [全部矩阵](repair-matrices.md) · [设计与不变量](design.md) · [Agent入口](agent-handoff.md) · [验证记录模板](verification-record.md)。

## 1. 总体目标与范围

按F01–F17逐项形成可派发、可回归、可停止恢复的任务；保留SQL领域过程唯一写入口、平台账户隔离、现有Auth/MFA/CSRF、旧Plan/Grant/兑换码/Checkout兼容。首要阻止NULL错误授予、无主processing漏履约和未关联paid无法处理；再闭环不可变合同、事实刷新/退款补偿、用户与Admin操作、主动对账和运行门槛。

不新增组织/支付渠道/微服务/OAuth/用户自助历史认领；不擅自实施Provider自动退款。必要的人工退款证据与Grant补偿属于本次风险闭环计划，自动渠道退款仍需后续明确派发。

## 2. 当前基线与工作区

- 审查代码基线 `1372fa72de08440d08f944b075c2c02868710814`，分支 `codex/billing-architecture-review`；计划编写期间出现外部归档提交 `d701d331d3774c80986a124b0d1916ac457f09c5`。本轮不改/回退该提交，保留[归档proposal](../../archive/subscription-billing-centralization/README.md)；活跃目录仅承载本次修复计划，不复制历史执行记录充当本次证据。
- 已有工作区改动为8个未跟踪架构图文件，详见矩阵；无未提交迁移/配置。BILL-16 cron已提交`639dd6a`，不是草稿。每次派发重新检查，不能永久沿用此结论。
- 固定项目CLI2.111.0、pnpm11.18.0；已有工具优先。Local脚本防误连远程；连接staging的本地页面不能当Local DB fixture。
- 上轮本地49项包级单元测试、61Deno、40SQL文件/724断言通过，但复现了NULL授予、过期lease、投影、退款事实、mapping、生命周期、Admin重放、unlinked失败。仅为历史证据，本轮业务测试全部NOT_RUN。
- 历史Staging月度/临时Lifetime和空队列cron有部分记录；年度、退款、恢复、生产仍不能由这些记录证明。

## 3. 问题统计与分派原则

**P0=0（未证实）、P1=10、P2=7、P3=0；唯一问题17个；具体TASK共56个；阶段9个。** 问题状态唯一维护在repair-issues；任务完成状态在各任务和实际验证记录中同步。P2含签名、限流、MFA/隐私和运营闭环子项，不能因级别低就一概延期。

优先队列：TASK-0001→0101的最小必填/Job合同→0301与0302→0304；这些P1可在旧schema上独立forward-fix，不等候所有UI或退款决策。其他任务按照直接依赖执行。

## 4. 阶段路线图与依赖

编号RC是修复命名空间，不与历史BILL混用。复用历史7个阶段的职责及文件名；新加00基线与08独立Admin。由于依赖与文件名历史不同，执行以本表/具体TASK为准，不按文件名字典顺序。旧阶段原文在归档只读引用，不再复制新的“BILL已完成”状态。

| 修复阶段/历史职责 | 目标 | 前置 | 涉及目录 | 详细文件 | 状态 |
| --- | --- | --- | --- | --- | --- |
| RC-00 | 基线、工作区与决策门槛 | 无；只读准备可立即派发 | docs/proposals | [阶段计划](phases/00-repair-baseline-and-gates.md) | 计划中 |
| RC-01 | 状态、关系与公共合同修复设计 | TASK-0001；涉及业务政策的部分等待TASK-0003 | docs/proposals、supabase/functions、packages/domain、docs/reference、packages/account-server、apps/template-preview、apps/admin、registry/manifest.json、registry/templates.json、packages/account-auth | [阶段计划](phases/01-global-catalog-and-contract-foundation.md) | 计划中 |
| RC-02 | 目录、不可变Checkout合同与购买意图 | RC-01；TASK-0203受D1约束，其余独立 | supabase/functions、packages/domain、docs/reference、packages/account-server、apps/template-preview、apps/admin、supabase/tests | [阶段计划](phases/02-redemption-v2-and-term-semantics.md) | 计划中 |
| RC-03 | 权威核验、Inbox、租约与未关联订单 | TASK-0101；完整集成等待RC-02；0301/0302可先独立修复 | supabase/functions、packages/domain、supabase/tests、docs/reference、packages/account-server | [阶段计划](phases/04-webhook-order-processing-and-billing-entitlement.md) | 计划中 |
| RC-04 | 共享权益、事实刷新、退款补偿与兑换码 | RC-01/RC-03；退款具体政策等待D2/D3 | supabase/tests、supabase/functions、packages/domain、docs/reference、apps/admin | [阶段计划](phases/03-billing-core-and-afdian-checkout.md) | 计划中 |
| RC-05 | Consumer支付体验与BFF恢复 | RC-02/RC-03/RC-04的对应合同；可先做纯展示/可访问性 | apps/template-preview、tests/spikes、packages/account-server、packages/account-auth-nextjs、packages/account-auth、packages/domain、packages/i18n、supabase/functions | [阶段计划](phases/06-consumer-sdk-and-reference-template.md) | 计划中 |
| RC-06 | Admin订单、人工处理与审计体验 | RC-03/RC-04；积压视图依赖TASK-0703 | apps/admin、tests/spikes、supabase/functions、docs/reference、packages/domain、supabase/tests | [阶段计划](phases/08-admin-billing-repair.md) | 计划中 |
| RC-07 | 主动对账、cron、告警与恢复 | RC-03；退款差异依赖RC-04；无需等UI完成可先执行 | supabase/functions、packages/domain、supabase/config.toml、docs/reference、apps/admin、docs/guides、docs/architecture、tests/spikes、supabase/tests | [阶段计划](phases/05-reconciliation-observability-and-central-admin.md) | 计划中 |
| RC-08 | 全链路验收、迁移演练与发布门槛 | RC-00–RC-07各任务输出；外部授权单列 | .github/workflows、package.json、tooling/scripts、tests/spikes、supabase/tests、docs/proposals、docs/guides、docs/architecture、docs/reference、registry/README.md | [阶段计划](phases/07-final-verification-cleanup-and-doc-sync.md) | 计划中 |

完整集成推荐顺序：RC-00→RC-01→RC-02→RC-03→RC-04→RC-07（后台对账/运维）→RC-05→RC-06→RC-08。不涉及共享文件且依赖已过的纯准备可独立做；不自动启动子Agent。RC-06的积压任务依赖RC-07，RC-07不依赖RC-06，因此无循环。

## 5. 阶段影响、验证与外部门槛

| 阶段 | 数据库影响 | API/OpenAPI/DTO/SDK | Consumer/Admin影响 | 必须验证 | Staging | Provider | 生产观察 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RC-00 | 本阶段无计划迁移 | 合同清单/只读准备或消费已冻结接口 | 通过后续UI任务验收投影和错误语义 | 基线/路径/规则静态核对 | 准备不需写远程；后续门槛必需 | 本地可先模拟，不能证明渠道 | 另授权；NOT_RUN |
| RC-01 | 本阶段无计划迁移 | 领域返回/Edge/双OpenAPI/DTO/SDK及BFF按TASK同步 | 通过后续UI任务验收投影和错误语义 | 静态+对应单元/SQL权限/真实HTTP/并发恢复；UI阶段加E2E/无障碍 | 准备不需写远程；后续门槛必需 | 本地可先模拟，不能证明渠道 | 另授权；NOT_RUN |
| RC-02 | 新增forward-fix；旧迁移只读 | 领域返回/Edge/双OpenAPI/DTO/SDK及BFF按TASK同步 | 通过后续UI任务验收投影和错误语义 | 静态+对应单元/SQL权限/真实HTTP/并发恢复；UI阶段加E2E/无障碍 | 相关集成需独立验收，当前NOT_RUN | 本地可先模拟，不能证明渠道 | 另授权；NOT_RUN |
| RC-03 | 新增forward-fix；旧迁移只读 | 领域返回/Edge/双OpenAPI/DTO/SDK及BFF按TASK同步 | 通过后续UI任务验收投影和错误语义 | 静态+对应单元/SQL权限/真实HTTP/并发恢复；UI阶段加E2E/无障碍 | 相关集成需独立验收，当前NOT_RUN | 真实合同/恢复需要；当前NOT_RUN | 另授权；NOT_RUN |
| RC-04 | 新增forward-fix；旧迁移只读 | 领域返回/Edge/双OpenAPI/DTO/SDK及BFF按TASK同步 | 通过后续UI任务验收投影和错误语义 | 静态+对应单元/SQL权限/真实HTTP/并发恢复；UI阶段加E2E/无障碍 | 相关集成需独立验收，当前NOT_RUN | 真实合同/恢复需要；当前NOT_RUN | 另授权；NOT_RUN |
| RC-05 | 本阶段无计划迁移 | 领域返回/Edge/双OpenAPI/DTO/SDK及BFF按TASK同步 | 12项Consumer独立任务 | 静态+对应单元/SQL权限/真实HTTP/并发恢复；UI阶段加E2E/无障碍 | 相关集成需独立验收，当前NOT_RUN | 本地可先模拟，不能证明渠道 | 另授权；NOT_RUN |
| RC-06 | 新增forward-fix；旧迁移只读 | 领域返回/Edge/双OpenAPI/DTO/SDK及BFF按TASK同步 | 14项Admin独立任务 | 静态+对应单元/SQL权限/真实HTTP/并发恢复；UI阶段加E2E/无障碍 | 相关集成需独立验收，当前NOT_RUN | 本地可先模拟，不能证明渠道 | 另授权；NOT_RUN |
| RC-07 | 新增forward-fix；旧迁移只读 | 领域返回/Edge/双OpenAPI/DTO/SDK及BFF按TASK同步 | 通过后续UI任务验收投影和错误语义 | 静态+对应单元/SQL权限/真实HTTP/并发恢复；UI阶段加E2E/无障碍 | 相关集成需独立验收，当前NOT_RUN | 真实合同/恢复需要；当前NOT_RUN | 另授权；NOT_RUN |
| RC-08 | 本阶段无计划迁移 | 合同清单/只读准备或消费已冻结接口 | 通过后续UI任务验收投影和错误语义 | 静态+对应单元/SQL权限/真实HTTP/并发恢复；UI阶段加E2E/无障碍 | 相关集成需独立验收，当前NOT_RUN | 真实合同/恢复需要；当前NOT_RUN | 另授权；NOT_RUN |

完整文件归属、API/数据库/SDK/UI影响、命令和测试类别见[矩阵](repair-matrices.md)。所有具体TASK包含目标、证据、依赖、文件、迁移/合同/UI/安全边界、步骤、负例、并发恢复、两端验收、命令、预期、回退及状态。

## 6. 横向合同与迁移发布顺序

- 付款事实、订单核验、处理任务、授予和当前active独立；未知值不得被failed或成功吞并。
- 全商业snapshot不可变；新增mapping版本而非改旧版；现有99年一次购买与旧续购目标的冲突在D1未确认前不擅自调整。
- Account/Admin/Job都调用共享SQL领域规则；用户输入不得指定归属/金额/期限，Admin不直接改Provider facts。
- Inbox提交后ACK；lease/fence覆盖每个提交；重试有界，人工/死信可见。原Order最多一次原Grant，补偿走独立操作与强来源关系。
- 先固定CLI生成新迁移、核对升级/权限→schema兼容扩展及领域→API/DTO/OpenAPI→SDK/BFF→Consumer/Admin/Registry→端到端验收；每个子任务同步消费者，不能等最终阶段一次补。
- 已应用生产迁移不改；新迁移有前置版本、DDL锁预算、回填检查点和兼容停止点。多阶段独立回退是应用停止/兼容回退+数据forward-fix，不是删除账本的down migration。

## 7. 阶段完成与失败恢复

每个TASK单独验收；阶段全部适用任务及依赖通过才能关闭。存在策略/外部环境缺口时标阻塞，独立准备仍可完成。应用失败回退到兼容且安全版本；交易数据、已付事实、幂等绑定、Grant/Event和审计保留。外部成功内部未知先权威查询，不能盲目重做退款、对象写入或新建订单。

停止新购买时继续接收已付款通知；暂停结算需保留可见积压；恢复通过接管/重查/人工补偿。真实部署/费用/生产恢复另授权。没有删除测试、宽RLS、绕MFA、吞错误或假进度的验收选项。

## 8. NOT_RUN和上线阻塞

本轮不运行业务单元、SQL/API、并发、Provider、Consumer/Admin E2E、无障碍、Staging/生产、调度故障、备份恢复；均NOT_RUN。D1/D2/D3和外部授权/接收人/阈值/备份目标未定的依赖标BLOCKED。文档检查的实际结果仅报告为计划验证，不继承历史结果。

上线前10项P1及安全相关P2必须闭环；G-DEV、G-PROVIDER、G-OPS和发布批准分别有证据。初次开启前先完成Staging等价验证和受控发布授权，开启后的生产观察单列，未完成不能扩大收费。详见[前置条件/风险矩阵](repair-matrices.md)。

## 9. 总完成条件

- [ ] F01–F17均有实现、失败回归和最终行为证据；没有遗漏子问题或消费者。
- [ ] 23并发故障场景及12项Consumer/14项Admin任务都有可观察结果；mock/local/staging/production分开。
- [ ] 迁移兼容、forward-fix、权限、码保留、删除屏障、对账恢复和告警实达完成。
- [ ] architecture/reference/guides只同步实际实现，旧proposal历史不冒充现状。
- [ ] 剩余外部门槛明确；本地完成不等于生产验收。

## 10. 下一项可立即执行的最小任务

**TASK-0001：冻结修复执行基线和工作区所有权。** 它只做只读检查和记录，不依赖真实Provider、生产Secret或未决业务政策。完成后可派发TASK-0101最小合同及TASK-0301，先让缺必填Provider事实产生零Grant。当前用户仅授权计划，不能自动开始这些修复。
