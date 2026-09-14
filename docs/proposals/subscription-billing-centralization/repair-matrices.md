# 修复依赖、文件、合同、测试与回滚矩阵

状态：Proposed。唯一问题来源[repair-issues.md](repair-issues.md)，唯一修复总计划[plan.md](plan.md)。本文件是计划附件，不是已执行测试报告。

## 1. 基线和已有工作区改动

- 计划研究起点：`1372fa72de08440d08f944b075c2c02868710814`。编写期间外部工作新增 `d701d331d3774c80986a124b0d1916ac457f09c5`，将旧proposal归档；该提交不是本任务产生。业务源码未因此变化。
- 原有未跟踪文件8个：`project-architecture-review.architecture.json`、`project-architecture-review.html`、四张1440x900/2048x1320明暗截图、`project-architecture-review.visual-check.html`、`project-architecture-review.visual-check.json`。均标记**已有工作区改动**，本轮不修改、不纳入计划提交。
- 研究起点和归档后均未发现未提交的迁移/配置；`20260913112306_bill_16_billing_worker_cron.sql`是已跟踪历史迁移，最后相关提交`639dd6a`，禁止将其当待提交草稿重写。
- 不读取/复制.env或真实Secret值，不修改新归档；旧阶段状态只引用[历史验证](../../archive/subscription-billing-centralization/verification-record.md)。

## 2. Proposal冲突与决策门槛

| ID | 冲突/缺口 | 处理策略 | 阻塞任务 |
| --- | --- | --- | --- |
| D0 | 原plan.md为兼容入口、00-master-plan为唯一总计划；研究中旧目录被外部提交归档 | 本次修复只保留一个活跃plan.md；归档原文不复制为第二活跃方案；按用户指定的原活跃路径保存本次修复，保留外部归档不变 | 已采用原请求路径；实施前重新核对目录归属 |
| D1 | 旧目标允许99年后月/年/99年续购；BILL-19当前一次购买，UI同商品禁用 | **已确认允许同一Plan重复购买**；每次成功付款在当前结束时间后增加99年；付款前提示“额外打赏”；保留订单/Grant独立事实、幂等和不同Plan冲突 | TASK-0203及0504相关Lifetime分支；详见[决策对比](decision-options-d1-d3.md) |
| D2 | 自动退款在旧phase-2；本轮发现结案不退款/不撤权 | **已确认网站不提供退款**；不调用Provider退款API，不因普通请求自动撤权；Provider退款/拒付仍记录事实并进入人工补偿告警，受适用法律/平台强制规则约束 | TASK-0403、0510、0606退款动作、0803；详见[决策对比](decision-options-d1-d3.md) |
| D3 | 暂停起算、关闭删除保留/匿名、Plan归档锁尚未一致 | **已确认**：暂停立即阻止新付费 Checkout、已有有限期权益继续；删除保留最小账务/审计事实并按受控法定/财务期限匿名；归档阻止新 Checkout、保留历史订单/快照/权益且旧 Plan 不可修改 | TASK-0401、0403、0706 已完成本地 forward-fix；具体保留天数仍需法务/财务配置；详见[D3简明说明](d3-lifecycle-explained.md) |
| D4 | 历史G-DEV PASS与当前反例并存；README/记录中的Staging叙述前后不一 | 保留历史；上轮49/61/724通过和实际反例分别登记，当前修复所有业务验证NOT_RUN | 所有关闭问题的验收 |
| D5 | “永久使用”与finite/99/year；文档26位格式与实际31默认 | 99年事实已定无需再询问；保留已发行码协议，改显示/文档不能重解释旧码 | 0501/0404/0804 |
| D6 | Admin列表全局可见但用户要求检查跨租户 | 保留中央system_admin，不新增平台Admin；分别证明用户隔离、Admin身份和服务端筛选 | 0602 |

## 3. 任务依赖和文件所有权

下表列全部直接依赖；任务编号是修复独立命名空间，不重用BILL-08～BILL-20编号。默认串行。只有显式授权多Agent后才允许不共享文件的任务并行；SQL迁移、account-api、DTO/OpenAPI、UI同页面和验证记录由单一集成人持有，本文不请求或启动子Agent。

| 任务 | 阶段 | 直接前置 | 问题 | 状态 |
| --- | --- | --- | --- | --- |
| [TASK-0001](phases/00-repair-baseline-and-gates.md#task-0001) | RC-00 | 无 | F17 | 本地基线冻结PASS；远程/生产门槛待验证 |
| [TASK-0002](phases/00-repair-baseline-and-gates.md#task-0002) | RC-00 | TASK-0001 | F14,F17 | 本地静态审查完成；Hosted配置/路径forward-fix/真实调用待验证 |
| [TASK-0003](phases/00-repair-baseline-and-gates.md#task-0003) | RC-00 | TASK-0001 | F03,F08,F09,F15,F17 | 阻塞（独立准备可做） |
| [TASK-0101](phases/01-global-catalog-and-contract-foundation.md#task-0101) | RC-01 | TASK-0001 | F01,F03,F04,F05,F10,F11,F12 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0102](phases/01-global-catalog-and-contract-foundation.md#task-0102) | RC-01 | TASK-0001；具体政策依赖TASK-0003 | F03,F07,F08,F16 | 共享授予入口平台禁用与 Global Delete identity barrier PASS；完整锁表/策略/并发/Hosted 待验证 |
| [TASK-0103](phases/01-global-catalog-and-contract-foundation.md#task-0103) | RC-01 | TASK-0101 | F05,F10,F11,F12,F15,F16,F17 | 本地实现及回归PASS；版本混跑及外部环境待验证 |
| [TASK-0201](phases/02-redemption-v2-and-term-semantics.md#task-0201) | RC-02 | TASK-0101,TASK-0102 | F07 | Local forward-fix 与 5/5 专项断言 PASS；真实 Provider、并发恢复、Hosted/Staging/生产待验证 |
| [TASK-0202](phases/02-redemption-v2-and-term-semantics.md#task-0202) | RC-02 | TASK-0201,TASK-0101 | F09,F05 | Local recovery wrapper、API/SDK 合同与回归 PASS；跨意图并发、Provider 迟到 paid、Hosted/Staging/生产待验证 |
| [TASK-0203](phases/02-redemption-v2-and-term-semantics.md#task-0203) | RC-02 | TASK-0201,TASK-0003(D1) | F09,F15 | 阻塞（独立准备可做） |
| [TASK-0301](phases/04-webhook-order-processing-and-billing-entitlement.md#task-0301) | RC-03 | TASK-0001,TASK-0101；完整snapshot集成依赖TASK-0201 | F01,F12 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0302](phases/04-webhook-order-processing-and-billing-entitlement.md#task-0302) | RC-03 | TASK-0001,TASK-0101 | F02 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0303](phases/04-webhook-order-processing-and-billing-entitlement.md#task-0303) | RC-03 | TASK-0302,TASK-0301 | F02,F14 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0304](phases/04-webhook-order-processing-and-billing-entitlement.md#task-0304) | RC-03 | TASK-0101,TASK-0302 | F04 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0305](phases/04-webhook-order-processing-and-billing-entitlement.md#task-0305) | RC-03 | TASK-0101,TASK-0302 | F13 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0306](phases/04-webhook-order-processing-and-billing-entitlement.md#task-0306) | RC-03 | TASK-0101,TASK-0301,TASK-0304；补偿状态依赖TASK-0402 | F05 | 本地实现及回归PASS；TASK-0402补偿链路及外部门槛待验证 |
| [TASK-0401](phases/03-billing-core-and-afdian-checkout.md#task-0401) | RC-04 | TASK-0102,TASK-0302；暂停/保留政策依赖D3 | F08 | D3 语义已实现；Local/CI/Staging 验证中，Provider/并发仍待验收 |
| [TASK-0402](phases/03-billing-core-and-afdian-checkout.md#task-0402) | RC-04 | TASK-0301,TASK-0302,TASK-0304 | F03 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0403](phases/03-billing-core-and-afdian-checkout.md#task-0403) | RC-04 | TASK-0401,TASK-0402；D2/D3 | F03 | 阻塞（独立准备可做） |
| [TASK-0404](phases/03-billing-core-and-afdian-checkout.md#task-0404) | RC-04 | TASK-0102,TASK-0401 | F16 | 未开始 |
| [TASK-0405](phases/03-billing-core-and-afdian-checkout.md#task-0405) | RC-04 | TASK-0404,TASK-0305 | F16,F13 | 未开始 |
| [TASK-0501](phases/06-consumer-sdk-and-reference-template.md#task-0501) | RC-05 | TASK-0201,TASK-0103 | F07,F15 | Local Consumer 展示、独立安装与双来源浏览器回归完成；Hosted/Provider/生产待验证 |
| [TASK-0502](phases/06-consumer-sdk-and-reference-template.md#task-0502) | RC-05 | TASK-0103,TASK-0401 | F15,F08 | 未开始 |
| [TASK-0503](phases/06-consumer-sdk-and-reference-template.md#task-0503) | RC-05 | TASK-0202,TASK-0502 | F09,F15 | 未开始 |
| [TASK-0504](phases/06-consumer-sdk-and-reference-template.md#task-0504) | RC-05 | TASK-0202,TASK-0503 | F09 | 未开始 |
| [TASK-0505](phases/06-consumer-sdk-and-reference-template.md#task-0505) | RC-05 | TASK-0503 | F09,F15 | 未开始 |
| [TASK-0506](phases/06-consumer-sdk-and-reference-template.md#task-0506) | RC-05 | TASK-0306,TASK-0501 | F05,F15 | 未开始 |
| [TASK-0507](phases/06-consumer-sdk-and-reference-template.md#task-0507) | RC-05 | TASK-0303,TASK-0506 | F02,F05,F15 | 未开始 |
| [TASK-0508](phases/06-consumer-sdk-and-reference-template.md#task-0508) | RC-05 | TASK-0202,TASK-0503 | F09,F15 | 未开始 |
| [TASK-0509](phases/06-consumer-sdk-and-reference-template.md#task-0509) | RC-05 | TASK-0306,TASK-0506,TASK-0401 | F05,F15 | 未开始 |
| [TASK-0510](phases/06-consumer-sdk-and-reference-template.md#task-0510) | RC-05 | TASK-0202,TASK-0403,TASK-0506 | F03,F05,F09 | 未开始 |
| [TASK-0511](phases/06-consumer-sdk-and-reference-template.md#task-0511) | RC-05 | TASK-0505,TASK-0506 | F15 | 未开始 |
| [TASK-0512](phases/06-consumer-sdk-and-reference-template.md#task-0512) | RC-05 | TASK-0502,TASK-0508,TASK-0404 | F13,F15,F16 | 未开始 |
| [TASK-0601](phases/08-admin-billing-repair.md#task-0601) | RC-06 | TASK-0101,TASK-0304 | F11 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0602](phases/08-admin-billing-repair.md#task-0602) | RC-06 | TASK-0102,TASK-0601 | F11,F17 | Local 权限/跨平台隔离回归及 forward-fix PASS；策略、Hosted/Admin E2E 待验证 |
| [TASK-0603](phases/08-admin-billing-repair.md#task-0603) | RC-06 | TASK-0601,TASK-0402 | F11,F03 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0604](phases/08-admin-billing-repair.md#task-0604) | RC-06 | TASK-0402,TASK-0609,TASK-0610 | F03,F10,F11 | 未开始 |
| [TASK-0605](phases/08-admin-billing-repair.md#task-0605) | RC-06 | TASK-0302,TASK-0303,TASK-0603 | F02,F11,F13 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0606](phases/08-admin-billing-repair.md#task-0606) | RC-06 | TASK-0303,TASK-0304,TASK-0403,TASK-0609,TASK-0610 | F03,F04,F10 | 未开始 |
| [TASK-0607](phases/08-admin-billing-repair.md#task-0607) | RC-06 | TASK-0401,TASK-0403,TASK-0610 | F03,F08 | 未开始 |
| [TASK-0608](phases/08-admin-billing-repair.md#task-0608) | RC-06 | TASK-0201,TASK-0403,TASK-0603 | F07,F11,F15 | 未开始 |
| [TASK-0609](phases/08-admin-billing-repair.md#task-0609) | RC-06 | TASK-0101,TASK-0304 | F10 | 本地实现及回归PASS；外部门槛待验证 |
| [TASK-0610](phases/08-admin-billing-repair.md#task-0610) | RC-06 | TASK-0102 | F10,F17 | 未开始 |
| [TASK-0611](phases/08-admin-billing-repair.md#task-0611) | RC-06 | TASK-0604,TASK-0605 | F10,F14 | 未开始 |
| [TASK-0612](phases/08-admin-billing-repair.md#task-0612) | RC-06 | TASK-0601,TASK-0609,TASK-0611 | F11,F10 | 未开始 |
| [TASK-0613](phases/08-admin-billing-repair.md#task-0613) | RC-06 | TASK-0404,TASK-0405,TASK-0610 | F16 | 未开始 |
| [TASK-0614](phases/08-admin-billing-repair.md#task-0614) | RC-06 | TASK-0701,TASK-0703,TASK-0605,TASK-0606 | F06,F11,F14 | 未开始 |
| [TASK-0701](phases/05-reconciliation-observability-and-central-admin.md#task-0701) | RC-07 | TASK-0301,TASK-0302,TASK-0304,TASK-0201 | F06,F12 | Local实现及回归PASS；Hosted/Provider/Staging/Production待验证 |
| [TASK-0702](phases/05-reconciliation-observability-and-central-admin.md#task-0702) | RC-07 | TASK-0002,TASK-0302,TASK-0303 | F14 | 本地 forward-fix 与回归 PASS；Hosted HTTP/pg_net/恢复待验证 |
| [TASK-0703](phases/05-reconciliation-observability-and-central-admin.md#task-0703) | RC-07 | TASK-0701,TASK-0702,TASK-0402 | F14,F06,F03 | Local实现及回归PASS；Hosted/Staging告警接收器与生产阈值待验证 |
| [TASK-0704](phases/05-reconciliation-observability-and-central-admin.md#task-0704) | RC-07 | TASK-0702,TASK-0404,TASK-0305 | F13,F14,F16,F17 | 未开始 |
| [TASK-0705](phases/05-reconciliation-observability-and-central-admin.md#task-0705) | RC-07 | TASK-0002,TASK-0702 | F14,F17 | 静态调用方矩阵完成；Hosted角色/网关/调度安装待验证 |
| [TASK-0706](phases/05-reconciliation-observability-and-central-admin.md#task-0706) | RC-07 | TASK-0401,TASK-0402,TASK-0705 | F17,F08,F03 | 个人信息匿名化 policy forward-fix 已实现；备份/恢复/生产演练仍未完成 |
| [TASK-0801](phases/07-final-verification-cleanup-and-doc-sync.md#task-0801) | RC-08 | 各被测TASK实现完成 | F17 | 未开始 |
| [TASK-0802](phases/07-final-verification-cleanup-and-doc-sync.md#task-0802) | RC-08 | TASK-0801,TASK-0706 | F17,F07,F08 | 未开始 |
| [TASK-0803](phases/07-final-verification-cleanup-and-doc-sync.md#task-0803) | RC-08 | TASK-0801,TASK-0802；G-PROVIDER/G-OPS实际授权 | F01,F02,F03,F04,F05,F06,F07,F08,F09,F10,F11,F12,F13,F14,F15,F16,F17 | 阻塞（独立准备可做） |
| [TASK-0804](phases/07-final-verification-cleanup-and-doc-sync.md#task-0804) | RC-08 | TASK-0801,TASK-0802；远程未完成项必须保留状态 | F17,F15,F16 | 未开始 |

## 4. 变更文件矩阵

都是未来候选文件；历史SQL只读。任务内若路径需调整，先rg现有文件再更新计划，不能杜撰已存在测试。

| 文件 | 任务所有者（串行） | 处理方式 |
| --- | --- | --- |
| `.github/workflows/workflow.yml` | TASK-0801 | 本轮不修改；实施任务获派发后按清单修改 |
| `apps/admin/app/api/v1/[...path]/route.ts` | TASK-0101、TASK-0103、TASK-0201、TASK-0202、TASK-0203、TASK-0601、TASK-0602、TASK-0603、TASK-0604、TASK-0605、TASK-0606、TASK-0607、TASK-0608、TASK-0609、TASK-0610、TASK-0611、TASK-0612、TASK-0613、TASK-0614 | 本轮不修改；实施任务获派发后按清单修改 |
| `apps/admin/features/billing/central-billing-page.tsx` | TASK-0601、TASK-0602、TASK-0603、TASK-0604、TASK-0605、TASK-0606、TASK-0607、TASK-0608、TASK-0609、TASK-0610、TASK-0611、TASK-0612、TASK-0614、TASK-0703 | 已接入队列/租约/游标/告警与送达状态；继续补充Hosted观察证据 |
| `apps/admin/features/operations/operations-center-page.tsx` | TASK-0614、TASK-0703 | 运行告警当前集中在中央Billing页；Operations页仍待统一入口整理 |
| `apps/admin/features/redemption/platform-redemption-batches-page.tsx` | TASK-0404、TASK-0613 | 本轮不修改；实施任务获派发后按清单修改 |
| `apps/admin/features/security/admin-recent-mfa-panel.tsx` | TASK-0610 | 本轮不修改；实施任务获派发后按清单修改 |
| `apps/admin/features/subscriptions/platform-subscription-page.tsx` | TASK-0403、TASK-0607、TASK-0608 | 本轮不修改；实施任务获派发后按清单修改 |
| `apps/template-preview/app/_lib/auth-session.ts` | TASK-0502 | 本轮不修改；实施任务获派发后按清单修改 |
| `apps/template-preview/app/api/v1/[...path]/route.ts` | TASK-0101、TASK-0103、TASK-0201、TASK-0202、TASK-0203、TASK-0501、TASK-0502、TASK-0503、TASK-0504、TASK-0505、TASK-0506、TASK-0507、TASK-0508、TASK-0509、TASK-0510、TASK-0512 | 本轮不修改；实施任务获派发后按清单修改 |
| `apps/template-preview/app/subscription/page.tsx` | TASK-0501、TASK-0502、TASK-0503、TASK-0504、TASK-0505、TASK-0506、TASK-0507、TASK-0508、TASK-0509、TASK-0510、TASK-0511、TASK-0512 | 本轮不修改；实施任务获派发后按清单修改 |
| `apps/admin/features/platform-settings/subscription-config-panel.tsx` | TASK-0401、TASK-0607 | 已新增暂停新购买开关、状态提示和有限期权益说明 |
| `docs/architecture/deployment.md` | TASK-0705 | 本轮不修改；实施任务获派发后按清单修改 |
| `docs/architecture/modules/entitlements.md` | TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `docs/architecture/modules/files-jobs.md` | TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `docs/architecture/modules/frontends.md` | TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `docs/architecture/overview.md` | TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `docs/guides/operations.md` | TASK-0703、TASK-0704、TASK-0705、TASK-0706、TASK-0802、TASK-0804 | 已补充0703告警生命周期、接收器和D2退款规则；后续任务继续同步 |
| `docs/guides/testing.md` | TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `docs/proposals/subscription-billing-centralization/design.md` | TASK-0003、TASK-0101、TASK-0102 | 本轮计划；后续执行记录按实际更新 |
| `docs/proposals/subscription-billing-centralization/plan.md` | TASK-0003、TASK-0804 | 本轮计划；后续执行记录按实际更新 |
| `docs/proposals/subscription-billing-centralization/repair-issues.md` | TASK-0001、TASK-0804 | 本轮计划；后续执行记录按实际更新 |
| `docs/proposals/subscription-billing-centralization/repair-matrices.md` | TASK-0002、TASK-0003、TASK-0101、TASK-0102、TASK-0103、TASK-0803 | 本轮计划；后续执行记录按实际更新 |
| `docs/proposals/subscription-billing-centralization/verification-record.md` | TASK-0001、TASK-0002、TASK-0802、TASK-0803、TASK-0804 | 本轮计划；后续执行记录按实际更新 |
| `docs/reference/api.md` | TASK-0401、TASK-0804 | 已同步暂停购买错误和 Checkout 前置条件 |
| `docs/reference/configuration.md` | TASK-0702、TASK-0704、TASK-0705、TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `docs/reference/contracts.md` | TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `docs/reference/contracts/account.openapi.json` | TASK-0101、TASK-0103、TASK-0201、TASK-0202、TASK-0203、TASK-0301、TASK-0306、TASK-0401、TASK-0404、TASK-0405 | 已增加 PURCHASES_PAUSED 稳定错误码 |
| `docs/reference/contracts/admin.openapi.json` | TASK-0101、TASK-0103、TASK-0201、TASK-0202、TASK-0203、TASK-0301、TASK-0303、TASK-0304、TASK-0402、TASK-0403、TASK-0404、TASK-0405、TASK-0601、TASK-0603、TASK-0604、TASK-0605、TASK-0606、TASK-0607、TASK-0608、TASK-0609、TASK-0610、TASK-0611、TASK-0613、TASK-0614、TASK-0703 | 已声明BillingObservability响应和告警字段 |
| `docs/reference/data-model.md` | TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `docs/reference/sdk.md` | TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `package.json` | TASK-0801 | 本轮不修改；实施任务获派发后按清单修改 |
| `packages/account-auth-nextjs/src/browser.ts` | TASK-0502、TASK-0508 | 本轮不修改；实施任务获派发后按清单修改 |
| `packages/account-auth/src/index.ts` | TASK-0103、TASK-0502 | 本轮不修改；实施任务获派发后按清单修改 |
| `packages/account-server/src/index.ts` | TASK-0101、TASK-0103、TASK-0201、TASK-0202、TASK-0203、TASK-0306、TASK-0501、TASK-0503、TASK-0507、TASK-0512 | 本轮不修改；实施任务获派发后按清单修改 |
| `packages/account-server/tests/client.test.ts` | TASK-0501、TASK-0503 | 本轮不修改；实施任务获派发后按清单修改 |
| `packages/domain/src/contracts/api.ts` | TASK-0101、TASK-0103、TASK-0201、TASK-0202、TASK-0203、TASK-0306、TASK-0401、TASK-0403、TASK-0404、TASK-0506、TASK-0601、TASK-0603、TASK-0605、TASK-0608、TASK-0611 | 已增加 purchases_paused 字段/reason 与 PURCHASES_PAUSED 错误码 |
| `packages/domain/src/contracts/billing.ts` | TASK-0101、TASK-0103、TASK-0201、TASK-0202、TASK-0203、TASK-0301、TASK-0303、TASK-0304、TASK-0306、TASK-0402、TASK-0403、TASK-0506、TASK-0701 | 本轮不修改；实施任务获派发后按清单修改 |
| `packages/domain/src/contracts/errors.ts` | TASK-0101、TASK-0103、TASK-0201、TASK-0202、TASK-0203、TASK-0405 | 本轮不修改；实施任务获派发后按清单修改 |
| `packages/domain/src/redemption.ts` | TASK-0404、TASK-0512 | 本轮不修改；实施任务获派发后按清单修改 |
| `packages/domain/tests/billing.test.ts` | TASK-0404 | 本轮不修改；实施任务获派发后按清单修改 |
| `packages/i18n/src/index.ts` | TASK-0511 | 本轮不修改；实施任务获派发后按清单修改 |
| `registry/README.md` | TASK-0804 | 本轮不修改；实施任务获派发后按清单修改 |
| `registry/manifest.json` | TASK-0103 | 本轮不修改；实施任务获派发后按清单修改 |
| `registry/templates.json` | TASK-0103 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/config.toml` | TASK-0702、TASK-0705 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/functions/_shared/afdian.test.ts` | TASK-0301、TASK-0305、TASK-0701 | TASK-0701 已新增分页签名/响应边界回归 |
| `supabase/functions/_shared/afdian.ts` | TASK-0301、TASK-0305、TASK-0402、TASK-0701、TASK-0704 | TASK-0701 已新增独立分页适配；后续TASK继续复用 |
| `supabase/functions/_shared/billing.ts` | TASK-0704 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/functions/account-api/index.test.ts` | TASK-0306、TASK-0405 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/functions/account-api/index.ts` | TASK-0101、TASK-0103、TASK-0201、TASK-0202、TASK-0203、TASK-0301、TASK-0304、TASK-0306、TASK-0401、TASK-0403、TASK-0404、TASK-0405、TASK-0512、TASK-0601、TASK-0602、TASK-0603、TASK-0604、TASK-0605、TASK-0606、TASK-0607、TASK-0608、TASK-0609、TASK-0610、TASK-0613、TASK-0614、TASK-0703 | metrics改读admin_billing_observability，订阅配置切换v2并返回PURCHASES_PAUSED |
| `supabase/functions/billing-webhook/index.test.ts` | TASK-0305 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/functions/billing-webhook/index.ts` | TASK-0305、TASK-0405 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/functions/maintenance/index.test.ts` | TASK-0302、TASK-0303、TASK-0701、TASK-0702、TASK-0703、TASK-0704 | 已新增告警评估、注入接收器和送达状态回归 |
| `supabase/functions/maintenance/index.ts` | TASK-0301、TASK-0302、TASK-0303、TASK-0402、TASK-0604、TASK-0701、TASK-0702、TASK-0703、TASK-0704、TASK-0705 | 已新增告警评估入口、批次运行接入、超时受控Webhook接收器 |
| `supabase/functions/maintenance/schedule.json` | TASK-0702、TASK-0705 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/migrations/20260907103848_security_helpers.sql` | TASK-0405 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260908103340_m3_dual_secret_redeem.sql` | TASK-0401 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260908185521_m4_09_backup_barrier_guard.sql` | TASK-0706 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql` | TASK-0706 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260911124902_bill_03_redemption_v2_lifecycle.sql` | TASK-0401、TASK-0403、TASK-0404、TASK-0607 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql` | TASK-0201、TASK-0202、TASK-0302、TASK-0304、TASK-0305、TASK-0306、TASK-0402 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql` | TASK-0401、TASK-0701 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql` | TASK-0304、TASK-0306、TASK-0403、TASK-0601、TASK-0602、TASK-0603、TASK-0604、TASK-0605、TASK-0606、TASK-0609、TASK-0610、TASK-0703 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260912103423_bill_11_afdian_discovery_worker.sql` | TASK-0302、TASK-0303 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql` | TASK-0201、TASK-0203、TASK-0301、TASK-0302、TASK-0304、TASK-0306、TASK-0402 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260912143000_hosted_runtime_role_membership.sql` | TASK-0705 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260912150000_afdian_checkout_payment_link.sql` | TASK-0201 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260913112306_bill_16_billing_worker_cron.sql` | TASK-0702 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql` | TASK-0203 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260913195500_bill_14_provider_contract_requeue_fix.sql` | TASK-0303 | 只读历史证据；通过新迁移forward-fix |
| `supabase/migrations/20260914223608_repair_task_d3_lifecycle.sql` | TASK-0401、TASK-0706 | D3 forward-fix：购买暂停、归档终态、保留政策和匿名化；由固定CLI生成 |
| `supabase/tests/bill_03_redemption_v2_lifecycle.sql` | TASK-0403、TASK-0404 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/bill_04_checkout_order_inbox_jobs.sql` | TASK-0201、TASK-0202、TASK-0302 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/bill_05_provider_verification_settlement.sql` | TASK-0301、TASK-0304、TASK-0402、TASK-0801 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/bill_06_admin_billing_and_consumer_authorization.sql` | TASK-0304、TASK-0403、TASK-0601、TASK-0609 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/bill_07_upgrade_compatibility.sql` | TASK-0404、TASK-0802 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/bill_09_idempotency_cleanup.sql` | TASK-0202 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/bill_12_afdian_checkout_payment_link.sql` | TASK-0201 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/bill_19_lifetime_purchase_guard.sql` | TASK-0203 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/m3_entitlement_ledger.sql` | TASK-0401 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/m6_02_backup_barrier_protocol.sql` | TASK-0706 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/t09_security_helpers.sql` | TASK-0405 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/t10_role_negative.sql` | TASK-0602 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/t13_platform_key_principal.sql` | TASK-0602 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/t14_account_lifecycle.sql` | TASK-0401 | 本轮不修改；实施任务获派发后按清单修改 |
| `supabase/tests/repair_task_d3_lifecycle.sql` | TASK-0401、TASK-0706 | 新增D3暂停、归档不可变、policy fail-closed与匿名化/审计保留回归 |
| `tests/spikes/e2e/t12-r2-admin.mjs` | TASK-0601、TASK-0602、TASK-0603、TASK-0604、TASK-0605、TASK-0606、TASK-0607、TASK-0608、TASK-0609、TASK-0610、TASK-0611、TASK-0612、TASK-0613、TASK-0614、TASK-0801 | 本轮不修改；实施任务获派发后按清单修改 |
| `tests/spikes/e2e/t16-r2-account.mjs` | TASK-0501、TASK-0502、TASK-0503、TASK-0504、TASK-0505、TASK-0506、TASK-0507、TASK-0508、TASK-0509、TASK-0510、TASK-0511、TASK-0512、TASK-0801 | 本轮不修改；实施任务获派发后按清单修改 |
| `tests/spikes/ops/m6-02-local-backup.mjs` | TASK-0706、TASK-0802 | 本轮不修改；实施任务获派发后按清单修改 |
| `tests/spikes/sql/bill-05-settlement-concurrency.mjs` | TASK-0801 | 本轮不修改；实施任务获派发后按清单修改 |
| `tooling/scripts/src/supabase.mjs` | TASK-0801 | 本轮不修改；实施任务获派发后按清单修改 |

## 5. API/数据库/SDK/UI影响矩阵

| 合同 | 数据库生产者 | Edge/OpenAPI/DTO | SDK/BFF/Registry | Consumer | Admin | 验收任务 |
| --- | --- | --- | --- | --- | --- | --- |
| Provider事实/状态 | 核验、观察历史、结算过程 | afdian/maintenance；billing.ts；Admin读取合同 | SDK仅消费，不做领域核验 | paid/未知/人工进度 | 最新与历史facts/签名/时间 | 0101,0301,0402,0603 |
| Checkout不可变snapshot/恢复 | 版本mapping、长期key/hash、创建/读取 | Account API；account.openapi；api/billing DTO | account-server create/get/list资格；Consumer allowlist；registry manifests | 商品、创建、跨Tab、取消、未来生效 | snapshot/钱款影响对照 | 0201,0202,0501–0510 |
| Grant/correction/退款 | entitlement_apply/recompute、退款事实/补偿链 | Admin API；admin.openapi；effects/preview DTO | 现有Admin请求封装，不另造SDK | 有效权益/退款进度 | preview/Grant/revoke/pause/resume | 0401–0403,0607,0608 |
| Inbox/lease/retry/dead-letter | claim/target/link/finish/requeue/cursors | Webhook/maintenance；错误/Job DTO | BFF只代理授权白名单 | 有界等待和手动查询 | 事件/租约/重排/审计 | 0302–0305,0605,0702 |
| Admin操作协议 | admin_billing_order_requery/resolve、admin_idempotency | Admin API/OpenAPI、version/operation/202 DTO | Admin BFF + adminAuthSession；no-store | 只读最终结果 | If-Match、同ID重放、异步进度 | 0604,0606,0609–0612 |
| 搜索/分页 | orders_list复合游标及服务端filters | 参数parser+Admin OpenAPI/DTO | 现有Admin数据请求工具 | 不扩大用户订单范围 | 列表/时间线/过滤联动 | 0601–0603 |
| 兑换码协议/限流 | batch/code/receipt/redeem、窗口计数 | domain redemption；Account/Admin输入/错误合同 | 生成服务端-only；BFF安全头/缓存 | 输入规范、失败不耗码 | 一次性交付/确认/禁用/导出 | 0404,0405,0512,0613 |
| 运维/对账 | discovery/processing游标、metrics、cron/Vault | maintenance+Admin metrics DTO、schedule配置 | 运维调用者而非浏览器SQL | 支付延迟解释 | Billing/Operations积压与恢复 | 0701–0706,0614 |
| 文档/发布兼容 | 迁移执行顺序和数据检查点 | OpenAPI/error/no-store/202枚举一致 | sdk pack、Registry独立安装、旧消费者兼容 | 本地真实BFF E2E | 本地真实Admin E2E | 0103,0801–0804 |

## 6. 迁移顺序与安全停止点

1. TASK-0001/0101/0102先冻结基线、字段/状态和锁关系。TASK-0301 NULL fail-closed与0302租约修复允许在旧schema上最小forward-fix，先不等待UI或新的退款schema。
2. TASK-0201/0202扩展snapshot/恢复；TASK-0304扩展合法未关联隔离；再集成0301/0306生产和读取。
3. TASK-0401生命周期、0402观察事实、0403补偿及0404/0405码/限流按直接依赖实施；不得把旧Grant改为退款日志。
4. Admin0601/0603/0609/0610相应领域和API扩展先行，再0604/0606等动作与Consumer接线；0701发现/0702调度/0703指标先于0614。
5. 每次新迁移列唯一slug（见阶段文件），CLI实际生成时间戳，不按TASK数字手造时间戳；执行前核对前序已应用、schema兼容、索引并发构建限制、DDL锁预算、权限及回填范围。
6. 多任务可共用一次小的原子迁移仅在明确同一验收单元时允许；不得把全阶段塞入不可隔离巨迁移。无数据down保证：保留扩展schema和交易记录、回退兼容应用，前向修正函数；确认旧版本不含已知漏洞才可启用。

## 7. 实际命令目录（本轮不运行业务命令）

| 类别 | 已有入口 | 执行前检查及不能替代的范围 |
| --- | --- | --- |
| doc | `pnpm docs:check`；`pnpm contracts:check`；`git diff --check` | 文档链接与OpenAPI结构检查；不证明业务运行。 |
| sql | `pnpm test:db`；`pnpm run test:sql:bill-05-concurrency` | pnpm test:db经tooling/scripts/src/supabase.mjs转test db --local；拒绝非localhost/PROJECT_REF；并发脚本先读环境/fixture清理，不跑linked reset。 |
| unit | `pnpm --filter @kit/domain test:unit`；`pnpm --filter @kit/account-server test:unit` | 核对package脚本与被测用例；既有runner不含新用例时先添加，不能靠旧PASS验收。 |
| edge | `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts` | DENO_DIR=E:/AppData/deno；固定Deno2.9.6；仅虚构/注入Provider；这些是handler单元测试，非真实HTTP。 |
| consumer | `pnpm --filter template-preview typecheck`；`pnpm test:e2e:t16-r2`；`pnpm test:registry:m5-04`；`pnpm test:consumer:m5-05` | 核对package脚本与被测用例；既有runner不含新用例时先添加，不能靠旧PASS验收。 |
| admin | `pnpm --filter admin typecheck`；`pnpm test:e2e:t12-r2` | 核对package脚本与被测用例；既有runner不含新用例时先添加，不能靠旧PASS验收。 |
| ops | `pnpm test:maintenance`；`pnpm test:ops:m6-02-local` | 核对package脚本与被测用例；既有runner不含新用例时先添加，不能靠旧PASS验收。 |
| final | `pnpm lint`；`pnpm typecheck`；`pnpm build`；`pnpm test:sdk:m5-02`；`pnpm runtime:probe` | 核对package脚本与被测用例；既有runner不含新用例时先添加，不能靠旧PASS验收。 |

- CLI：项目固定 `supabase=2.111.0`、`pnpm=11.18.0`；先version/help再migration new；不自动升级或安装。系统软件复用，自定义安装必须D:/APP/Codex/工具名；缓存E:/AppData/工具名。
- `pnpm test:api`是not-enabled占位，不能当API测试；本地真实HTTP可扩展现有 `tests/spikes/e2e/t16-r2-account.mjs`、`tests/spikes/e2e/t12-r2-admin.mjs` 或在TASK-0801新增明确runner并登记package.json。
- 本轮不执行build/typecheck/sdk:pack（它们可能产生构建/打包输出），只执行docs:check、contracts:check与diff/计划覆盖检查。
- 每项真实Provider/staging/生产命令只在授权环境及fixture已确认后记录准确命令，当前NOT_RUN；禁止把凭据打印为命令行、禁止在计划填真实URL和Token。

## 8. 23个故障/并发验收矩阵

每行最终都要记录DB、Provider、UI、Grant/Job/Audit；风险字段引用唯一问题总表，不能漏记重复扣款/重复Grant/漏单/资金损失的实际结论。无外部付款fixture则Provider层标NOT_RUN，不伪造成功。

| 场景 | 内容 | 负责TASK | 数据库期望 | Provider/UI期望 | 本地 | staging | 生产 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | 重复点击购买 | 0503,0504,0202 | 同意图1 Checkout；不同付款均保留 | Provider可能两次paid；UI恢复原意图 | NOT_RUN | NOT_RUN | NOT_RUN |
| C02 | 同Idempotency-Key异参数 | 0202,0609 | 拒绝异参且原结果不变 | Provider无新动作；UI明确冲突 | NOT_RUN | NOT_RUN | NOT_RUN |
| C03 | 两Provider订单竞争Checkout | 0301,0304,0203 | 一笔自动Grant；第二笔可见manual/duplicate | 两笔钱不可丢；UI保留首笔成功与第二笔处理 | NOT_RUN | NOT_RUN | NOT_RUN |
| C04 | Webhook重放 | 0305 | 相同可信事件不放大Job；异hash留痕 | Provider付款不变；UI不重复成功 | NOT_RUN | NOT_RUN | NOT_RUN |
| C05 | ACK后进程崩溃 | 0302,0305 | ACK前已入队；重启可执行 | 已paid继续恢复；UI显示等待处理 | NOT_RUN | NOT_RUN | NOT_RUN |
| C06 | Provider超时 | 0303,0507 | 有界retry或人工，不留永久processing | Provider未知不可冒充失败；UI可手动刷新 | NOT_RUN | NOT_RUN | NOT_RUN |
| C07 | Provider限流 | 0303,0701 | 遵守预算/Retry-After，不丢队列 | Provider未知；UI不引导重付 | NOT_RUN | NOT_RUN | NOT_RUN |
| C08 | Provider异常字段 | 0301 | 不完整合同零Grant且保留原因 | UI合同复核；不把空字段当成功 | NOT_RUN | NOT_RUN | NOT_RUN |
| C09 | Provider paid但DB提交失败 | 0302,0402 | 事务回滚后可接管重查；无重复Grant | 钱已付；UI不再创建新单恢复 | NOT_RUN | NOT_RUN | NOT_RUN |
| C10 | DB提交与Grant失败边界 | 0301,0402 | Grant/Event/Settlement原子，非半提交 | paid可进入人工/重试；UI不称已开通 | NOT_RUN | NOT_RUN | NOT_RUN |
| C11 | Grant成功HTTP响应丢失 | 0202,0402,0609 | 原结果可重放；原订单一次授予 | UI查原单，不重新付款 | NOT_RUN | NOT_RUN | NOT_RUN |
| C12 | 双Worker领取 | 0302 | 同一未过期Job只一个owner | 外部最多受预算查询；无重复权益 | NOT_RUN | NOT_RUN | NOT_RUN |
| C13 | lease过期旧Worker返回 | 0302 | 新fence有效、旧owner零写入 | 旧结果不覆盖最新事实 | NOT_RUN | NOT_RUN | NOT_RUN |
| C14 | 任务执行服务重启 | 0302,0702 | 过期可接管并最终排空 | UI进度可恢复，运维能看到停工 | NOT_RUN | NOT_RUN | NOT_RUN |
| C15 | 退款与授予并发 | 0402,0403 | 按D2补偿关联原单/替代Grant，不复活 | Provider退款与UI进度分别核对 | NOT_RUN | NOT_RUN | NOT_RUN |
| C16 | Admin Grant与支付结算并发 | 0401,0607 | 账户锁下顺延或冲突，无重复操作 | UI展示实际生效区间 | NOT_RUN | NOT_RUN | NOT_RUN |
| C17 | 两个管理员会话修改同订单 | 0609,0610 | 同operation重放；新操作旧version拒绝 | UI412恢复且原因/MFA有效 | NOT_RUN | NOT_RUN | NOT_RUN |
| C18 | 兑换码并发兑换 | 0404,0405 | 只消费一次且只一个Grant | 失败用户明确已兑，不泄露其他账户 | NOT_RUN | NOT_RUN | NOT_RUN |
| C19 | 禁用兑换码批次与兑换并发 | 0404,0613 | 串行可解释，不禁用后复活 | UI说明已兑Grant独立处理 | NOT_RUN | NOT_RUN | NOT_RUN |
| C20 | Plan下架与Checkout完成 | 0201,0401 | 固定锁序和旧snapshot政策 | paid无法履约进入人工，不丢单 | NOT_RUN | NOT_RUN | NOT_RUN |
| C21 | 平台/账户/订阅暂停与结算 | 0401 | 按D3检查，不绕过身份/暂停边界 | UI分清暂停与资金成功 | NOT_RUN | NOT_RUN | NOT_RUN |
| C22 | 用户删除与支付Webhook维护并发 | 0401,0705,0706 | 屏障/tombstone有效，保留去重而不复活用户 | paid隔离处理；用户数据不再可见 | NOT_RUN | NOT_RUN | NOT_RUN |
| C23 | Storage/Provider外部成功内部写失败 | 0402,0403,0706 | unknown可查询补偿，对象/交易唯一 | 不盲重做外部动作；UI显示未知结果 | NOT_RUN | NOT_RUN | NOT_RUN |

## 9. 测试类别、结果和证据合同

| 类别 | 必须证明 | 当前本轮业务结果 |
| --- | --- | --- |
| 静态 | 链接/语法/类型/消费者引用；本轮文档检查独立记录 | NOT_RUN |
| 单元 | 字段空值、金额、SKU数量、状态、HMAC格式、SDK重放 | NOT_RUN |
| SQL/RLS/权限 | 最终关系/Grant数/归属/owner/search_path/REVOKE/GRANT | NOT_RUN |
| API合同 | 真实HTTP认证、状态body、错误、202、ETag/If-Match、幂等、no-store | NOT_RUN |
| 并发 | 两个真实连接/会话、串行解释和最终记录 | NOT_RUN |
| Webhook重放 | 签名/原始字节/事件唯一/ACK前后崩溃 | NOT_RUN |
| Provider | 真实官方合同样本与模拟分别记；退款/分页/旧链接 | NOT_RUN |
| Consumer E2E | 12个独立UX任务及23故障关联 | NOT_RUN |
| Admin E2E | 14个独立操作任务及资金权益证据 | NOT_RUN |
| 可访问性/响应式 | 390px、桌面、键盘、focus、读屏、缩放、明暗 | NOT_RUN |
| Local | 确认localhost、fixture起止计数、无真实数据 | NOT_RUN |
| Staging | 独立授权/真实网关与角色；历史结果只引用 | NOT_RUN |
| Production | 发布后另授权的只读观察与受控交易；本地不外推 | NOT_RUN |
| 调度/恢复/备份/告警 | 真实调用方、故障注入、对象恢复、墓碑、接收端送达 | NOT_RUN |

结果只能PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED。状态与环境分列，禁止PARTIAL_STAGING或NOT_PASS作新结果值；历史原文保留且注明历史。每条记录字段：时间、环境、源码HEAD、任务/用例、命令与退出码、Provider观察摘要、DB最终Order/Settlement/Grant/Event/Job/Audit、UI状态、四类业务风险结论、自动/人工恢复、脱敏证据位置、fixture残留、未运行原因。无外部动作不填Provider=PASS。

## 10. 风险与回滚矩阵

| 阶段/风险 | 停止条件 | 恢复/回退 | 不可逆边界 |
| --- | --- | --- | --- |
| RC-00/01 基线或政策冲突 | 工作区变化、D1/D2/D3未定、命令指向远程 | 保留所有用户改动；只做独立准备；更新计划不猜政策 | 不恢复归档、不回退外部提交 |
| RC-02 mapping/旧单 | 无法证明旧价/旧SKU/旧key恢复 | 停新购买；旧单隔离、保留旧mapping；兼容应用回退 | 不能改已付金额或删长期key绑定 |
| RC-03 核验/租约 | 错误Grant、旧fence写入、死信丢失 | 暂停自动结算，继续入站，受控重排/forward-fix | 已完成资金/Grant通过新补偿，不靠DB down |
| RC-04 权益/退款/兑换 | correction错关联、退款比例未定、码泄露 | 停止相应动作；记录外部事实，受控撤销/修正，轮换受影响密钥 | 已交付明文不能收回；退款不可当作可回滚网络操作 |
| RC-05 Consumer | 错价/假成功/新key重复付款 | 回退兼容UI；服务端保留原意图和付款；不回退到有已知P1版本 | 本地取消无法保证外部链接失效 |
| RC-06 Admin | 错scope/错preview/原样重放失败 | 禁用受影响管理动作，保留operation状态；查结果再补偿 | 不能直接编辑Provider facts或恢复已撤销Grant旧行 |
| RC-07 调度/恢复 | 缺Token、404、批次失联、备份或告警失败 | 配置只经授权纠正；重领过期Job；隔离恢复后对账/墓碑重放 | 禁止生产reset；外部对象和钱款需单独确认 |
| RC-08 验收/发布 | 任何未处置P1或门槛缺证据 | 不开放真实购买；按失败任务回到阶段修复和复测 | 不能用历史PASS或删除失败解除门槛 |

## 11. 上线阻塞与真实支付前置条件

- 全部10项P1关闭，7项P2中涉及签名/限流/MFA/隐私/退款/运维及合同的子项同样为上线必选；仅非安全视觉精修可以明确延期并记录责任。
- D1/D2/D3有决定和对应测试；原始Grant唯一、退款补偿、未关联队列、无Webhook补单、expired lease接管均验证。
- G-DEV：真实本地HTTP/双连接/两端E2E、兼容升级和关键反例通过；静态checker不替代。
- G-PROVIDER：月/年/99年当前正式合同，签名、custom_order回显、数量/优惠/失败/旧链接、退款和分页；历史月/临时Lifetime付款不覆盖年度与生产。
- G-OPS：实际调度、最小角色/网关、预算、密钥轮换、积压恢复、告警接收人、外部备份/删除屏障和RPO/RTO。
- Staging临时Lifetime价与生产正式价分别核对，恢复临时价或改Provider配置仍要具体授权；不把catalog.purchasable=true作为收费准入。
- 发布前检查迁移链/hash、未提交配置归属、Secret隔离、日志脱敏、回退版本安全、值班与停止阈值。法律/金融监管/税务事项仅记需要专业审查，不作合规保证。
- 生产首次开启与观察单独授权；开启前门槛和开启后观察不能循环依赖：先验收Staging等价门槛并获受控发布批准，再执行小范围生产验证，未完成观察不得扩大收费或宣称生产已验收。

## 12. 官方依据与本轮核对边界

2026-09-13读取Supabase changelog索引及相关官方页。调度可用pg_cron/pg_net/Vault，但本项目自定义Worker鉴权不能机械照搬示例，见[官方调度](https://supabase.com/docs/guides/functions/schedule-functions)。数据库备份不含实际Storage对象，见[官方备份](https://supabase.com/docs/guides/platform/backups)。

[扩展版本变更](https://supabase.com/changelog/extension-version-pinning-ignored)提示Hosted扩展版本声明不能代替实际版本查询；固定CLI不等于固定托管扩展，实施前只读核验，不修改旧迁移。[日志接口变更](https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint)仅当工具调用旧logs.all时影响；TASK-0703/0705检查调用方，不据此宣称仓库已有故障或自行升级依赖。[备份调度修复](https://supabase.com/changelog/bulk-prepare-retry-on-transient-failure)不替代实际备份成功与恢复记录。
