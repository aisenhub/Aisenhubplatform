# 统一订阅与中央支付总计划

> 状态：In Progress。BILL-01～BILL-06 已完成本地实现/验证，BILL-07 本地最终检查已完成；真实 Provider、G-OPS 与生产门槛仍未运行。

目标依据：[最新架构](AisenFlow_Subscription_Billing_Architecture.md)；[设计差距](design.md)；[交接](agent-handoff.md)；[证据](verification-record.md)；[Afdian 调试参考](afdian-debug-reference.md)。

## 1. 目标与边界

在现有中央共享后台上增加统一商品、中央支付、可恢复结算和真实 Consumer 接入。lifetime固定为99年有限期（finite/99/year），允许普通同Plan续购，不再新增商业永久起点修正；保留现有Admin真永久兼容与通用审计修正。保留默认 Free 单一来源、同 Pro 不同周期、平台账户隔离、SQL 唯一权益写入口和旧接口兼容。

本期不实现 Free claim、OAuth/历史认领、更多支付渠道、自动退款、Suite 或授权缓存；第二期有独立入口。真实付款、部署、渠道商品/价格/密钥变更和生产恢复需实际授权，计划自身不授予。

## 2. 阶段和依赖

| 编号 | 内容 | 前置/门槛 | 状态 |
|---|---|---|---|
| BILL-01 | 协议与设计冻结 | 只读代码基线；产出 G-DEV 与独立 G-PROVIDER | G-DEV 已完成；G-PROVIDER 未运行 |
| BILL-02 | Catalog/config/公共合同 | G-DEV；真实购买保持关闭 | 本地已验收；Provider 未运行 |
| BILL-03 | Ledger/Redemption/生命周期合同 | BILL-02 | 本地已验收；真实结算未运行 |
| BILL-04 | Checkout/Order/Inbox/持久任务 | BILL-03 的数据、锁和 correction 合同 | 本地已验收；Provider/权威结算未运行 |
| BILL-05 | 权威验证/结算/双进度对账 | BILL-04；模拟可验收，渠道状态单列 | 本地已验收；G-PROVIDER 未运行 |
| BILL-06 | Admin 结案/SDK/BFF/Consumer | BILL-05 DTO/命令冻结 | 本地已验收；真实 Consumer/生产未运行 |
| BILL-07 | 完整验收/迁移恢复/发布准备 | BILL-02～06；真实购买就绪还需 G-PROVIDER/G-OPS | 本地最终检查已完成；G-PROVIDER/G-OPS 未运行 |

G-DEV 允许 Provider-neutral 和模拟器开发；G-PROVIDER 证明真实渠道合同，不能由固定向量或 fake Adapter 代替；G-OPS 证明调度、开关、权限、恢复等运行准备。三者独立记录。BILL-01 可达到开发准备完成但渠道验证仍 NOT_RUN，不能被简称为“全部验证通过”。

- [BILL-01：协议验证、决策与开发门槛](phases/01-global-catalog-and-contract-foundation.md)
- [BILL-02：Catalog、平台映射与公共合同](phases/02-redemption-v2-and-term-semantics.md)
- [BILL-03：Ledger、Redemption V2 与生命周期合同](phases/03-billing-core-and-afdian-checkout.md)
- [BILL-04：Checkout、订单、Inbox 与持久任务](phases/04-webhook-order-processing-and-billing-entitlement.md)
- [BILL-05：Provider 验证、结算与双进度对账](phases/05-reconciliation-observability-and-central-admin.md)
- [BILL-06：中央 Admin、Consumer SDK/BFF 与服务端授权](phases/06-consumer-sdk-and-reference-template.md)
- [BILL-07：完整验收、迁移恢复与发布准备](phases/07-final-verification-cleanup-and-doc-sync.md)

## 3. 历史计划迁移说明

| 旧内容 | 新归属 |
|---|---|
| Phase01 Catalog | BILL-02；crypto 验证移 BILL-01 |
| Phase02 Redemption | BILL-03；删除 Free claim、16位默认，增加 correction/生命周期 |
| Phase03 Checkout | BILL-04；增加 HMAC 恢复、版本映射、长期操作绑定 |
| Phase04 Webhook | Inbox/任务基础归 BILL-04，验证/结算归 BILL-05 |
| Phase05 | 对账归 BILL-05，Admin 结案归 BILL-06，调度准备归 BILL-07 |
| Phase06 | BILL-06，增加服务端授权及新状态 |
| Phase07 | BILL-07，补完整升级/恢复/真实渠道证据 |

文件名保留，内容已重组，禁止按历史文件名猜任务范围。默认串行；若实际派发授权并行，先冻结 DTO，按文件划分所有权。migration、核心 SQL、account-api、OpenAPI、共享 DTO、Admin shell 和验证记录只能一个集成负责人修改；不能凭本表自动启动其他 Agent。

## 4. 要求—任务—验收追踪

| ID | 架构要求 | 实现阶段 | 必须证明的结果 |
|---|---|---|---|
| R01 | §1～4/53～57 中央自营/BFF边界 | 02/06/07 | 新平台无需改中央业务代码；Key不入浏览器 |
| R02 | §5/6/25 目录与Free单源 | 02 | 四商品约束、ambiguous backfill关闭购买、旧plans不变 |
| R03 | §8.2/20 Provider权威 | 01/05 | 证据矩阵；未验证签名不代替query-order |
| R04 | §9.3 调价/版本发布 | 02/04/06 | 一个当前版本，旧合同可验证；价差人工处理 |
| R05 | §10/11 Checkout恢复 | 04/06 | 响应丢失/7天清理后同键仍定位原Checkout；状态不倒退 |
| R06 | §13/21/22 结算与隔离 | 04/05 | 同order一次原结算；同Checkout两笔款只一笔自动结算；同平台跨账户FK拒绝 |
| R07 | §15/16/17/18/41 Inbox任务 | 04/05 | 提交后ACK；崩溃/接管可恢复；网络不持锁 |
| R08 | §19 优惠/数量/金额 | 04/05 | 只接受snapshot批准规则；币种/月数/SKU数量完整验证 |
| R09 | §23/24/42 99年有限期与通用修正 | 03/05/06 | 99年日历顺延、重复续购、到期回退、Admin真永久兼容、通用撤销/修正及退款定位 |
| R10 | §26～28 旧码兼容 | 03/06 | 新默认31、合法旧码可兑、付费success强FK不放松 |
| R11 | §29～35/48 SDK状态与页面 | 04/06 | paid不冒充granted；review/resolved可理解；旧接口兼容 |
| R12 | §36～39/49 Admin结案 | 05/06 | MFA/operation_id/版本；撤权益不冒充退款；异常可闭环 |
| R13 | §40/47 双进度对账 | 05/07 | 游标推进后旧失败仍重试；页移动/深扫/头部预算 |
| R14 | §43/44/46 生命周期 | 03/04/05/07 | 暂停/关闭/删除并发不复活身份；清理不破FK |
| R15 | §30.1 服务端授权 | 06 | 受保护操作实际拒绝暂停/到期/中央不可用 |
| R16 | §50/51 最小权限/阶段 | 03～07 | executor无直接任意写；旧写路径退出；角色负向测试 |
| R17 | §52/58 上线与恢复 | 01/04/07 | G-DEV/G-PROVIDER/G-OPS分开；调度与应急开关可演练 |

任何新架构要求必须补本表和阶段测试，不能以“57章节均有对应”替代覆盖证据。

## 5. 横向不变量

结算决定区分暂时阻塞、人工等待、最终已处理；无Grant不等于最终拒绝。首次原结算永久去重，退款/撤销不能让旧通知再次授权。correction 使用独立操作、强原始关联和单有效替代链，不绕过原订单幂等。

Checkout长期操作绑定独立于7天响应缓存；清理缓存不重建交易。到期只影响未付款显示和新链接签发，已付/已授权永不变expired。已结算Checkout不重新签发付款链接。

旧Checkout、未结订单和可兑批次均纳入Plan切换预检。Billing删除保留/匿名关联先设计再建FK。已有外链不能假定可被本地撤销。所有新价格/映射发布、Admin结案与后台结算都须有明确锁顺序和失败语义。

## 6. 完成标准

阶段交付指实现、相应实际验证与远端提交；真实渠道状态单列。完整方案可标Completed前，R01～R17必须有证据，G-PROVIDER和G-OPS通过；否则最多“本地实现已验收，真实接入待验证”。这不要求擅自部署生产。

测试前核对现有命令；按阶段运行有意义的定向测试。相关改动后补复测，不靠删除测试或降低权限要求过关。提交阶段只包含授权文件；小提交、push、核对远端SHA，禁止自动合并main/发布/部署。
