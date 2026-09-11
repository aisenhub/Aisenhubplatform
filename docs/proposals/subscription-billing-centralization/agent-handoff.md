# Agent 交接与执行边界

> 稳定执行规则。实施证据只写 [verification-record.md](verification-record.md)。当前全部功能阶段未开始。

## 1. 可派发提示词

~~~text
请实施用户本次明确指定的 BILL-XX 阶段，仅执行该阶段及必要依赖检查。
先读取根AGENTS.md、docs/README.md、docs/architecture/overview.md、docs/agents.md、
docs/proposals/subscription-billing-centralization/AisenFlow_Subscription_Billing_Architecture.md、
本目录00-master-plan.md、verification-record.md及对应phases文件，再读源码和合同。
最新架构是唯一目标依据；旧Phase编号/历史文件名不是执行内容。
核对pwd、remote、branch、HEAD、status、固定工具与现有测试入口，保护其他修改。
G-DEV通过可开展独立本地实现；G-PROVIDER未通过禁止真实购买启用。
一次只完成实际派发阶段，计划不是自动连续实施全部阶段的授权。
~~~

## 2. 必须遵守

- 新默认31位码；合法旧码兼容；本期不实现Free claim、不放宽付费兑换FK。
- Checkout HMAC可重建、长期操作绑定独立于7天缓存，重放返回当前状态；已付/已结算不回退expired、不再签发付款链接。
- 未冻结可信签名合同前query-order权威确认；优惠必须snapshot批准。
- Inbox+任务提交后ACK；后台最终执行不依赖进程内存。发现和处理进度分离。
- 原订单一次原结算；同Checkout第二笔真实款保存并人工处理；无Grant不能一律终态化。
- lifetime是99年有限期，复用日历顺延、真实截止日期与到期回退；允许续购，保留Admin真永久限制，不开发商业永久起点专用流程。
- correction独立操作关联替代链，退款定位当前有效授权；不能绕过幂等。
- 旧Checkout/未结订单/可兑Batch均参与Plan切换；生命周期与删除不能被付款绕过。
- Key仅BFF/server；受保护业务服务端授权；中央故障不伪装Free、不放行。
- SQL private过程唯一业务写入口，HTTP/SDK不复制期限、冲突或配额算法。

## 3. 门槛与授权

开发、真实渠道与运维门槛分别记录。无真实凭据可完成模拟本地工作，不得假报渠道可用；Provider合同不明、保留/锁/FK未冻结时停止依赖部分，继续独立检查。

读取计划不是实施授权；生产、真实付款、外部商品/费用变化须用户实际授权。文档中的样例命令也不是已运行证据。Supabase操作前读技能与当前官方文档，固定CLI生成迁移；不改旧生产迁移。

## 4. 文件所有权与工具

默认串行BILL-01→02→03→04→05→06→07；G-PROVIDER可独立核验但启用前必须完成。用户实际授权并行时，仅在DTO冻结后分配独立文件；核心migration/SQL、account-api、OpenAPI/DTO、Admin shell和验证记录由单一集成人维护。

复用已安装工具，系统软件按D:/APP/Codex/工具名、缓存E:/AppData/工具名，不默认装C盘。项目依赖遵守仓库目录。

## 5. 验证与Git

按阶段执行真实定向测试，记录命令/环境/commit/退出码，失败与复测不删除；pnpm test:api占位不算通过。只暂存任务文件，小提交、push授权仓库任务分支并核对远端SHA；不强推、改共享历史、自动merge/main/Release/部署。

交付状态=相应实现+相应实际验证+远端提交；三类门槛不能互相替代。文档提交不把阶段改成已交付。每阶段结束报告改动/验证/剩余/Git/下一满足依赖任务，未派发下一阶段不继续开发。
