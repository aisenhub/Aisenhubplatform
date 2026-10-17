# Authoritative Results Reading

适用于 KPI、审计、计费、任务结果、状态汇总等“读取权威结果并据此行动”的界面。

## 真值优先

UI 只呈现真实来源：

- 未提供的数据不显示假 `0`；
- 缺失 outcome 不默认 success；
- accepted 不等于 completed；
- unknown outcome 不等于 failure，也不能引导盲目重放非幂等动作；
- 有界列表长度不能冒充全量 KPI；
- last known data + refresh error 与完全读取失败分开。

## 信息层级

一级阅读展示做决策必需的对象、状态、范围、时间和核心数值；request id、raw code、UUID 等技术信息按排障需要进入详情，不压过业务含义。

## 恢复

结果不可确认时提供重新读取权威状态、打开详情或支持 ID 等真实恢复入口。UI 不自行推断领域状态，也不通过 Toast 把不确定结果包装成成功。

## 可达性

状态有文字语义；数字和 ID 需要时可复制；表格/Inspector 的长内容、时间和错误在键盘、窄屏和放大下仍可访问。
