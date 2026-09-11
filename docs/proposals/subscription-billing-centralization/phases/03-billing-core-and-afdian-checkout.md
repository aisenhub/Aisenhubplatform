# BILL-03 — Ledger、Redemption V2 与生命周期合同

> 状态：未开始。文档已按最新架构修订，不代表功能实施或联调完成。

## 1. 目标与前置

依赖BILL-02。扩展商业永久、历史兑换兼容与可审计修正，并冻结Billing生命周期/锁合同。源代码已有correct UI不代表新永久排期修正已支持。

## 2. 源码与文件

核对m3_entitlement_ledger、m3_redemption_flow、m3_calendar_interval_fix及后续重定义迁移；复用private.entitlement_apply/recompute、Admin命令与兑换wrapper、packages/domain/src/redemption.ts、Admin redemption/subscription页面。

新增CLI迁移与SQL测试，修改domain/contracts、account-api、Admin批次UI及OpenAPI。生命周期必读现有identity delete/retention任务、files-jobs、data-model和operations，不能仅看Entitlements模块。

## 3. Redemption V2

batch增加model_version和不可变product/plan/term/duration snapshot；旧行保持原plan/duration/HMAC解释，不反推product。新批次只接受monthly/yearly/lifetime和数量/到期/交付字段；Free明确拒绝，不建free_claim字段、不放松付费success的同码同账户Grant FK。

新码默认31个安全随机字符，保留现有alphabet与rejection sampling；保留合法历史16–128输入和原HMAC domain/key version。Domain提供唯一normalize/validate/format；任何显示分隔符去除需明确无歧义，不能把UI旧16位正则当新标准。生成密钥材料留在服务端。

保留两阶段交付、明文仅首次返回、receipt/session绑定、禁用不可复活、同码一次消费、确定性失败不消费。新创建合同原子切换API/SQL/UI，保留旧行读取/兑换但不双写新批次。

## 4. 永久与修正链

商业永久在同Plan有限尾部开始；已有未来/当前未撤销永久也阻止新兑换/Checkout；Admin原严格永久规则保留。不同Plan冲突和暂停校验仍由统一领域过程执行。

撤销前置Grant后不自动移动未来永久，允许明确的历史空档。Admin预览返回影响及版本；执行时锁后重新核实预览版本，漂移返回冲突。

设计受控correction命令：独立operation_id、reason、原Grant/原始结算引用、被替代Grant、替代Grant、单一有效替代链；撤销与新增同事务，失败全部回滚。原订单仍最多一次原结算，替代不是第二次billing_order原始授权。建议独立correction关联事实/事件，不修改source_id为弱文本，也不把operation_id再设成原order.id。

退款/撤销通过链定位当前有效替代授权；两个并发correction仅一个成功，重放返回既有结果。不能仅换一个UUID逃避原结算唯一性。Billing关联待BILL-04有订单表后补强FK，但本阶段冻结接口和不变量。

## 5. 生命周期与锁合同（建Billing表前门槛）

列出现有identity/platform/key/account/plan/batch/code锁顺序，形成含checkout/order/task的统一顺序表；实际SQL核对后冻结，所有Admin/用户/job入口遵循。网络不持DB事务，任务租约不等于允许跳过账户生命周期。

设计每张Billing候选表的保留期类别、敏感字段、清理前置、匿名关联/tombstone、FK动作、删除任务checkpoint与恢复动作。真实付款历史去重不能随Auth删除消失；tombstone不得重新关联新身份。不得凭新增RESTRICT让现有删除卡死，亦不得CASCADE抹去财务事实。

暂停是暂时授权阻塞；关闭/删除进入人工处理，不自动激活。清理、结算和修正并发必须有确定先后。具体保留期与操作责任须在实施时形成明确合同，不虚构法定年限；无法确定时阻塞相关迁移，其他独立工作可验收。

## 6. 验收

历史fixture升级而非只空库reset；旧码可兑、新默认31、非法字符拒绝、交付丢失/禁用/过期/同码抢兑回归。finite→yearly/永久、UTC月末/闰年、未来永久拒绝重复、不同Plan冲突。

增加前置撤销空档、修正预览漂移、原子修正失败、并发修正、撤销替代后重放等SQL用例。完成生命周期/FK/锁决策表才交BILL-04；缺口具体记录，不用“后续考虑”作为通过。


## 执行纪律与交付

开始前读取根 AGENTS.md、docs/README.md、docs/architecture/overview.md、docs/agents.md、[最新架构](../../AisenFlow_Subscription_Billing_Architecture.md)、[总计划](../00-master-plan.md)、[交接规则](../agent-handoff.md)、[验证记录](../verification-record.md)，再读本阶段列出的合同和实际源码。文件名沿用历史路径，仅便于导航；任务编号与内容以当前 BILL 标题为准，不按旧 Phase 含义实施。

只执行用户实际派发阶段；计划不是后续开发、生产部署、真实付款或费用变更的自动授权。每阶段工作前核对 remote、branch、HEAD、status，保护其他修改；已授权仓库为 https://github.com/aisenhub/Aisenhubplatform.git。沿用任务分支，缺失时使用 codex/ 前缀。

Supabase 实施时读取适用技能、核对当前官方文档和固定 CLI（以当时 package/lock 为准），先 --help 再生成新增迁移；不修改已应用旧迁移。复用现有工具；系统软件自定义安装在 D:/APP/Codex/工具名，缓存放 E:/AppData/工具名，项目依赖按仓库约定，不默认安装到 C:。

本阶段列出的新增入口、文件和测试均为计划，不是已有能力。实现前核对实际路径；新增测试命令须同步 package.json，不能将不存在的命令或 pnpm test:api 占位记为 PASS。按变更运行对应 SQL/API/并发/恢复/SDK/UI 测试，以及 docs:check、contracts:check；代码变更运行适用 lint/typecheck/build。文档同步随阶段已实现事实推进，不能拖到最后才修公共合同。

验收后检查 staged diff 和敏感信息，仅提交本阶段文件；小提交、push 并核对远端 SHA，记录实际结果。未 push 不标已交付，不 force push、不重写共享历史、不自动合并 main、Release 或部署。验证分静态、本地运行、真实 Provider 联调、生产观察；未执行写 NOT_RUN。失败与复测保留，代码和记录更新可分开提交，避免追逐记录自身 SHA。
