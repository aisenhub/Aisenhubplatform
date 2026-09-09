# 开发规划入口

基于架构v1.2；DP1制定于2026-09-07，DP2于2026-09-08基于已有实现校准。本轮只更新计划，不执行后续应用任务；既有实现以实际进度和证据为准。

## 阅读顺序

1. [架构基线](../architecture.md)与[Agent规则](../../AGENTS.md)。
2. [开发总计划](master-plan.md)：模块、依赖、阶段门槛与完成定义。
3. [决策和默认参数](decision-register.md)：已确认、工程默认、外部待提供项。
4. [验证计划](verification-plan.md)：技术验证与验收用例ID。
5. [公共合同](contracts.md)：目录所有权、SQL入口、序列化与剩余验证边界。
6. [首批任务T01～T18](tasks/batch-01.md)：依赖、范围、步骤、验收与首项派发指令。
7. [第二批M3任务](tasks/batch-02.md)：Plan、Ledger、兑换与全链路阻塞边界。
8. [实际进度](status.md)：规划交付与应用实现分开记录。
9. [规划复核记录](planning-review.md)：中断恢复后的修正、静态检查和剩余验证边界。
10. [DP2校准基线](evidence/DP2-baseline.md)：当前代码、历史证据和未闭环差异。
11. [首批收尾细化](tasks/closeout-01.md)：T12/T16、G1/G2、M3及托管验收承接。
12. [第三批M4任务](tasks/batch-03.md)：文件、预算、恢复任务和Local/Staging门槛。
13. [DP2后续路线](roadmap-dp2.md)：M5/M6任务链、冻结时点、发布与生产边界。

## 模块实施规格

| 模块 | 规格 |
|---|---|
| M0 | [工程基座与技术验证](modules/M0-foundation.md) |
| M1 | [数据库与安全公共设施](modules/M1-database-security.md) |
| M2 | [身份、平台与账户](modules/M2-identity-platform.md) |
| M3 | [权益与兑换](modules/M3-entitlements-redemption.md) |
| M4 | [配置文件与持久任务](modules/M4-files-jobs.md) |
| M5 | [SDK、Admin与Registry成品](modules/M5-sdk-admin-registry.md) |
| M6 | [生产运行与发布](modules/M6-operations-release.md) |

执行任务前必须读取所引用规格及公共合同，不能从总计划直接推测接口。验证报告遵循[证据规则](evidence/README.md)。

## Auth 优化专项

入口为 [ASU-R1 修订后的执行计划](../plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/00-master-plan.md)。ASU-01～05 与 ASU-V01～16 的范围、依赖和实际记录在该计划包维护；目前产品实施未开始，运行验证 NOT_RUN。用户已准备完整 Frontend 独立计划，待 Auth 优化交付后承接，不因本入口存在而自动执行。

## 状态词典

- READY：任务前置条件已具备，可以派发；不是已获自动执行授权。
- WAITING：存在明确依赖，依赖完成后可派发。
- IN_PROGRESS：已开始执行，记录分支/负责人。
- BLOCKED：实际遇到无法继续的具体条件，记录原因和可继续部分。
- DONE：交付、检查、证据齐全；需要远端同步的任务还须确认push。
- NOT_RUN：某项验证尚未执行，不能等同PASS或FAIL。
- PARTIAL：已有可独立验收部分，原任务仍有明确缺项；不能等同整项DONE。
- NOT_STARTED：模块尚未实施；已写计划不改变该状态。

默认单个集成人依次派发任务。任务之间的可独立性不代表自动授权启动多个agent。
