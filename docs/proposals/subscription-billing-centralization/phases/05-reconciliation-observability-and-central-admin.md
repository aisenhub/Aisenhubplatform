# BILL-05 — Provider 验证、结算与双进度对账

> 状态：未开始。文档已按最新架构修订，不代表功能实施或联调完成。

## 1. 目标与依赖

依赖BILL-04。实现Provider权威验证、唯一订单结算、人工状态与双进度对账；G-PROVIDER未通过只能模拟验证，真实渠道能力仍NOT_RUN。

## 2. 源码/交付

扩展_shared/afdian.ts、_shared/billing.ts、billing-webhook、maintenance及其Deno tests；CLI迁移增加受控normalize/verify/settle/retry/resolution命令与SQL测试。Admin命令合同本阶段冻结，UI归BILL-06。

Adapter仅buildCheckoutUrl/sign/query/normalize，期限和冲突仍SQL统一入口。未完成可信签名合同验证前一律query-order权威确认；无效签名最多提供订单号发现线索，不混合未经验证Payload字段。

## 3. 验证与订单观察

校验provider账号/订单success、Token关联、plan/type、SKU全集和数量、购买month、币种与精确金额、snapshot优惠规则。默认实付等于snapshot且无未批准渠道兑换；折扣/零元仅snapshot明确批准时接受，否则保留付款并人工处理。

可信观察更新不能被后到未验证Payload覆盖；已验证归属不可换账号，已授权不降级。渠道不提供的字段不得从最新mapping补齐伪造合同。

## 4. 结算状态与事务

区分：retryable/blocked（暂时故障、可恢复暂停）、review_required（重复款/合同冲突/关闭删除）、finalized（已授权或受控结案）。不把所有无Grant当永久终态。恢复暂停后允许受控重试；已退款/结案不得被自动任务复活。

统一wrapper接收order id和受控job context，锁后读取可信order/snapshot与当前生命周期，再竞争Checkout自动结算槽位。首笔合规款一次原结算；同Checkout第二笔真实款duplicate_payment，不同Checkout有限续购正常顺延，永久并发仅一笔生效。

Grant/Event/Projection、结算决定、订单效果和审计同事务。已撤销原Grant的旧order重放仍返回原结算历史，不重新发放。billing原结算operation_id=order.id；correction走独立受控链，不违反原结算唯一性。

## 5. 人工命令合同

提供精确订单重查、暂时失败重试、外部退款确认、关闭异常、受控有效续购/修正。每条明确定义Admin身份+recent MFA、reason、operation_id、expected_version、可用状态、幂等与审计；不得提供任意改归属/改snapshot。

重复款转续购是显式人工结算，不占第二个自动槽位，保留duplicate问题及处理决定；已finalized只允许新的审计补偿流程，自动重试无权改写。退款确认记录外部金额/币种/脱敏参考；权益撤销独立，沿correction链定位当前有效替代，不能冒充渠道退款API。

## 6. 双进度对账

发现通道：头部扫描+重叠区，持久化订单线索后推进discovery高水位；命中单个已知订单不足以证明区间完整。分页移动允许重复但必须补扫，page只是continuation提示。页预算触顶保存续扫，每轮仍分配头部预算，周期深扫补旧创建迟到成功。

处理通道：本地pending/retryable任务按next_attempt_at领取，独立于Provider分页恢复。高水位推进后失败订单仍可重试。API网络在所有事务之外；fence验证覆盖游标提交和任务结算，旧worker不得写结果。

配置与证据：头部/历史预算、重叠范围、深扫频率、Provider限流、并发/单次超时、退避上限；在协议能力确认后冻结数值，未有稳定游标不得声称绝不漏单。

## 7. 指标和运行接口

分别记录discovery_last_success_at、processing_last_success_at、oldest_pending_age、retryable/manual_review数量、duplicate_payment数量、API限流/失败；不把HTTP200当结算健康。

交出受控maintenance支付任务/发现/处理入口、认证方式、批量预算、调度所需参数和幂等保证；实际调度与应急演练由BILL-07完成。

## 8. 验收

fixture跑完整checkout→持久任务→query权威验证→order→Grant/Event/Projection→GET状态。测试重复10次、Webhook/对账并发、同Checkout两笔真实款、不同Checkout永久并发、Grant事务崩溃、撤销后重放、暂停恢复重试和finalized不可复活。

测试错plan/type/count/month/币种/优惠、零元未批准转人工、映射调价/停平台/归档/删除竞态、未关联付款。测试页移动、迟到旧单、page cap、头部不饿死、游标推进后旧任务失败恢复、fence过期及Provider超时。

完成SQL/API/Deno/maintenance实际测试与Admin命令合同，交BILL-06；真实Provider联调结果独立记录，不能用fake宣称已连接。


## 执行纪律与交付

开始前读取根 AGENTS.md、docs/README.md、docs/architecture/overview.md、docs/agents.md、[最新架构](../../AisenFlow_Subscription_Billing_Architecture.md)、[总计划](../00-master-plan.md)、[交接规则](../agent-handoff.md)、[验证记录](../verification-record.md)，再读本阶段列出的合同和实际源码。文件名沿用历史路径，仅便于导航；任务编号与内容以当前 BILL 标题为准，不按旧 Phase 含义实施。

只执行用户实际派发阶段；计划不是后续开发、生产部署、真实付款或费用变更的自动授权。每阶段工作前核对 remote、branch、HEAD、status，保护其他修改；已授权仓库为 https://github.com/aisenhub/Aisenhubplatform.git。沿用任务分支，缺失时使用 codex/ 前缀。

Supabase 实施时读取适用技能、核对当前官方文档和固定 CLI（以当时 package/lock 为准），先 --help 再生成新增迁移；不修改已应用旧迁移。复用现有工具；系统软件自定义安装在 D:/APP/Codex/工具名，缓存放 E:/AppData/工具名，项目依赖按仓库约定，不默认安装到 C:。

本阶段列出的新增入口、文件和测试均为计划，不是已有能力。实现前核对实际路径；新增测试命令须同步 package.json，不能将不存在的命令或 pnpm test:api 占位记为 PASS。按变更运行对应 SQL/API/并发/恢复/SDK/UI 测试，以及 docs:check、contracts:check；代码变更运行适用 lint/typecheck/build。文档同步随阶段已实现事实推进，不能拖到最后才修公共合同。

验收后检查 staged diff 和敏感信息，仅提交本阶段文件；小提交、push 并核对远端 SHA，记录实际结果。未 push 不标已交付，不 force push、不重写共享历史、不自动合并 main、Release 或部署。验证分静态、本地运行、真实 Provider 联调、生产观察；未执行写 NOT_RUN。失败与复测保留，代码和记录更新可分开提交，避免追逐记录自身 SHA。
