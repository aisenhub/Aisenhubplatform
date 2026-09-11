# 第二期：OAuth 与历史订单认领

> 非本期；须用户另行派发并核对官方能力。不得作为BILL-01～07验收依赖。

目标仅绑定支付外部身份，不替代Supabase身份。OAuth code/state/会话绑定与server-side交换、可信回调、令牌保留和unlink需重新设计。

认领前query-order权威验证、外部身份所有权、订单尚未结算/未归属、目标平台账户合法；用户选择平台不等于有权认领任意订单。与V1长期结算/匿名删除/tombstone/人工结案兼容，同订单只认领一次，冲突不改原事实。

V1 unlinked记录保留不代表已可认领。实现前更新 [唯一架构](../../AisenFlow_Subscription_Billing_Architecture.md) 与独立计划，不让该方向覆盖现行V1合同。
