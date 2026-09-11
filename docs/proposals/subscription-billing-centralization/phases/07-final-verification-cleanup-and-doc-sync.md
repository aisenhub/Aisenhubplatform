# BILL-07 — 完整验收、迁移恢复与发布准备

> 状态：未开始。文档已按最新架构修订，不代表功能实施或联调完成。

## 1. 目标与前置

依赖BILL-02～06本地交付与BILL-01 G-DEV。验证完整升级、恢复与发布准备；G-PROVIDER、G-OPS未通过时只能报告本地实现完成，不标整体Completed，不擅自部署或付款。

## 2. 升级与兼容

从真实等价pre-upgrade fixture升级，不只空库reset。核对旧用户/平台/Plan/Grant/Event/Batch/码的计数与关联；旧合法16–128码、新31默认、历史HMAC、旧/v1/plans及新批次单写。

检查Billing FK/匿名保留、账号关闭/删除/retention任务和恢复步骤。测试清理普通7天幂等响应后Checkout长期绑定仍有效、旧订单去重不消失、删除后通知不复活身份。

schema采用expand/受控启用/forward-fix，明确旧API与新schema的兼容窗口。关闭新购买是首要止损，不能为了回滚删Order/Ledger；说明哪些迁移不可安全down。

## 3. G-OPS 调度与恢复

固定谁调用maintenance新入口、调用认证/密钥管理、频率、并发上限、单次预算、退避和积压报警责任人；按BILL-05与Provider限流冻结实际数值。复用现有可用调度设施，不凭“有HTTP接口”宣称自动运行；缺少调度条件则记录阻塞。

独立开关至少覆盖新Checkout签发、Webhook接收、自动结算、后台重试/发现。正常止损只关新购买，继续接收已付款并保存任务；若暂停结算，积压可见且可恢复。接收停用属于单独故障措施，不可随购买开关误关。

本地演练调度停机→积压→重启、lease接管、Provider限流、密钥轮换/丢失、DB/代码恢复后的去重；恢复后重新对账重建状态，不重复发Grant。已打开外部链接不能假定已失效，迟到付款继续按snapshot验证/人工处理。

## 4. 完整故障矩阵

执行总计划R01～R17并保存每项用例/代码/结果映射，重点：同Checkout两笔款、99年并发顺延、Admin真永久兼容、跨世纪日期及到期回退、前置撤销+替代链+退款定位、暂停恢复、finalized重放、映射/Plan切换与可兑批次、ACK后崩溃、游标推进后失败重试、页移动/历史迟到、跨平台及同平台跨账户负向权限。

PII检查覆盖数据库、日志、错误、浏览器bundle和URL埋点；Webhook executor/Account/Admin/job不得任意写表。临时加密白名单清理必须验证，不能把“非永久保存”写成没有清理实现。

## 5. 新平台验收

建立fixture平台B，配置Free/Pro、Key/Origin/Auth callback与SDK/BFF，安装用户/订阅及受保护操作示例。Products、Checkout、模拟结算、兑换、服务端授权全部运行且平台A权益不变；无需中央代码/新Provider商品/Webhook。

真实渠道联调依据G-PROVIDER清单与实际授权运行，模拟结果绝不代替；不要求擅自生产观察。记录部署准备和真实Provider结果，真实购买保持关闭直到门槛齐全并获部署授权。

## 6. 命令与旧路径退出

核对并运行docs:check、contracts:check、format:check、lint、typecheck、test:unit、runtime:probe、build、test:db、test:maintenance及实际新增billing SQL/API/Deno、SDK/安装/浏览器测试。pnpm test:api占位不计通过。代码变化影响结果须复测。

使用rg核查旧16位默认、Free claim本期实现、旧Checkout状态、默认零元接受、单高水位、硬编码价格/URL、前端授权、重复期限算法、任意DML和日志PII；历史码兼容与第二期说明不是需要删除的旧功能。

## 7. 文档同步与最终退出

核对architecture overview/entitlements/frontends/files-jobs、reference data-model/api/contracts/sdk/configuration、guides operations/testing、registry和proposal导航；只写实际已实现事实，合同变化应在各阶段已同步，此处做最终核对。

验收记录区分静态、本地、Provider、生产四类；G-DEV/G-PROVIDER/G-OPS分别有状态与证据。实际门槛全部通过、阶段提交远端可核对后才Completed；未通过写具体剩余，不能将计划修订或fake闭环称为整体实现。无自动merge/Release/生产部署。


## 执行纪律与交付

开始前读取根 AGENTS.md、docs/README.md、docs/architecture/overview.md、docs/agents.md、[最新架构](../AisenFlow_Subscription_Billing_Architecture.md)、[总计划](../00-master-plan.md)、[交接规则](../agent-handoff.md)、[验证记录](../verification-record.md)，再读本阶段列出的合同和实际源码。文件名沿用历史路径，仅便于导航；任务编号与内容以当前 BILL 标题为准，不按旧 Phase 含义实施。

只执行用户实际派发阶段；计划不是后续开发、生产部署、真实付款或费用变更的自动授权。每阶段工作前核对 remote、branch、HEAD、status，保护其他修改；已授权仓库为 https://github.com/aisenhub/Aisenhubplatform.git。沿用任务分支，缺失时使用 codex/ 前缀。

Supabase 实施时读取适用技能、核对当前官方文档和固定 CLI（以当时 package/lock 为准），先 --help 再生成新增迁移；不修改已应用旧迁移。复用现有工具；系统软件自定义安装在 D:/APP/Codex/工具名，缓存放 E:/AppData/工具名，项目依赖按仓库约定，不默认安装到 C:。

本阶段列出的新增入口、文件和测试均为计划，不是已有能力。实现前核对实际路径；新增测试命令须同步 package.json，不能将不存在的命令或 pnpm test:api 占位记为 PASS。按变更运行对应 SQL/API/并发/恢复/SDK/UI 测试，以及 docs:check、contracts:check；代码变更运行适用 lint/typecheck/build。文档同步随阶段已实现事实推进，不能拖到最后才修公共合同。

验收后检查 staged diff 和敏感信息，仅提交本阶段文件；小提交、push 并核对远端 SHA，记录实际结果。未 push 不标已交付，不 force push、不重写共享历史、不自动合并 main、Release 或部署。验证分静态、本地运行、真实 Provider 联调、生产观察；未执行写 NOT_RUN。失败与复测保留，代码和记录更新可分开提交，避免追逐记录自身 SHA。
