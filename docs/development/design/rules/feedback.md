# Feedback Rules — 6

## UX-FEEDBACK-ASYNC-LOADING — MUST

等待反馈适应真实等待并保持界面稳定。近乎即时操作避免闪烁；长等待选择 skeleton/busy/progress。只有可靠分母才显示百分比，不假造 ETA/进度；保留无冲突操作与现有可信数据。

## UX-FEEDBACK-EMPTY-STATES — MUST

区分真正无数据、尚未配置、筛选无结果和读取失败。只显示帮助判断或继续任务的内容；没有真实下一步时不硬加 CTA/插画。

## UX-FEEDBACK-CONFIRMATION — MUST（不可逆或高风险操作）

确认说明实际对象、范围和后果；Cancel/Escape/关闭不会执行危险动作。低风险、可撤销操作不统一加确认。Aisenhub 服务端 recent MFA、权限和幂等仍是权威边界。

## UX-FEEDBACK-ERROR-RECOVERY — MUST

失败后保留合法工作和最后可信结果，并提供适用恢复路径。错误不是“失败了”或开发堆栈；非幂等、费用或最终结果未知的动作不能自动重试。

## UX-FEEDBACK-TASK-STATUS — MUST

queued/running/cancelling/cancelled/failure/partial success/completed 等只消费真实任务状态。`accepted` 不等于 success；取消请求不等于取消完成；unknown outcome 不伪装成功或失败。

## UX-FEEDBACK-NECESSARY-COMPLETION — MUST

重要保存、导出、管理动作有可理解完成依据；可直接观察到的普通更新不重复 Toast。短消息不承载唯一恢复动作，也不抢焦点。
