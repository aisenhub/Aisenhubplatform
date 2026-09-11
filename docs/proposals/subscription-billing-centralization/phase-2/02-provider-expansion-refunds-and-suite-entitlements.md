# 第二期：多渠道、退款、Suite 与可选增强

> 非本期；每项均须独立需求、设计与派发，不提前实现假入口。

新增Provider复用Ledger但须评审订单粒度、自动续费/取消、退款/争议、时间与结算语义；不能承诺只加Adapter且所有合同不变。

自动退款必须有权威可定位原交易事件；部分退款如何影响权益另行决定。通过原结算和correction链找到当前有效授权，保留原订单及独立退款事实，不删除Grant。手工退款确认也不等于已有渠道退款API。

Suite/All Access定义显式scope和fan-out一致性，不能隐式扩大现有单平台订单。

Free claim只有明确邀请/活动业务才独立建Claim事实，不放松现有付费兑换成功FK。授权缓存只有明确最大暂停/撤销延迟、next_transition截止与失效协议后评审；本期保持服务端实时权威检查。

依据 [唯一架构](../../AisenFlow_Subscription_Billing_Architecture.md)，不把第二期内容重新混入BILL验收。
