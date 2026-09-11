# BILL-06 — 中央 Admin、Consumer SDK/BFF 与服务端授权

> 状态：本地 G-DEV 已验收；真实 Consumer 会话、Provider、生产 NOT_RUN。中央 Billing Admin、Consumer BFF、Checkout/兑换页面和服务端授权辅助已实现。

## 1. 目标与依赖

依赖BILL-05 DTO与Admin命令合同。交付中央Admin异常结案与Consumer真实接入，所有成功以服务端权威结果为准。

## 2. 文件与消费者

核对apps/admin shell/nav/features/plans/redemption/subscriptions、apps/template-preview/app/subscription/page.tsx、account页面、packages/account-server、account-auth-nextjs、domain/contracts、registry与SDK/安装测试。API通过account-api统一受控入口，Admin不直接SQL。

## 3. 中央Admin

全局Billing提供Products、Provider版本发布、Orders、Checkouts、Webhook任务、Reconciliation与人工待处理视图。平台开关仍只在platform workspace维护，不复制第二个写入口。

价格/mapping显示当前与历史版本、验证状态、发布阻塞原因；修改带MFA/reason/expected_version，不能覆盖旧snapshot或自动改真实渠道商品。secret仅configured/missing。

Orders展示付款事实、归属、结算/修正链、暂时阻塞或人工原因、解决状态。实现BILL-05命令UI：重查、重试、外部退款确认、关闭异常与受控续购/修正。敏感操作先展示具体影响，unknown outcome保留operation_id并读取结果；不得仅增加“查看失败订单”页面就验收结案闭环。

撤销/修正预览普通有限授权空档（含99年）并验证版本；退款与撤权益独立显示，不把payment改成未付款。列表过滤/分页在服务器，权限、MFA、412、重复提交和错误提示都测试。

## 4. SDK/BFF

保留flat methods，可添加subscription facade但不复制HTTP实现。支持products/current/create/get/redeem及稳定错误/request_id；POST仅同Idempotency-Key重试，确定性业务冲突不盲重试。`@kit/account-server` 增加 `authorizeProtectedFeature`，只以中央 entitlement 为权威，不在本地重算到期或信任浏览器字段。

Browser→同源 BFF→Central API；BFF 只暴露订阅/Checkout/兑换白名单路径，Key 仅 server env，会话/Origin/CSRF/method 按现有认证合同。Auth allowlist、callback、returnTo 与账户显式激活仍以现有应用配置为准；不声称跨域自动登录。

## 5. 用户页面

当前权益、四档展示、三付费购买、兑换输入。价格/copy从API；默认新码31、历史合法输入兼容；无Free claim入口。

Checkout显示pending/expired/paid/verified/granted/review_required/resolved，paid不写“已开通”，人工处理显示原因与下一动作。99年已生效或排期仍允许有限续购；只有已有Admin真永久授权才禁购。lifetime显示99年套餐与真实截止日期，SDK返回term而非perpetual；同Checkout第二笔异常不覆盖首笔成功。已付或过期重放不再重新展示付款链接，刷新仍保留真实状态。

仅对服务端本次允许签发的URL提供打开/弹窗阻止回退；不存到分析日志或持久客户端记录。丢失响应用同键恢复，不靠新Checkout解决。状态轮询有上限/退避，关闭页面不影响后台结算。

删除旧硬编码prices/afdianPaymentUrl、confirmPayment、联系管理员永久购买旧入口、独立16位regex、假setTimeout兑换；未配置环境明确报未配置，不保留默认演示成功路径。

## 6. 服务端受保护操作示例

增加最小、可安装的Consumer服务端授权示例，具体路径核对现有App Router后确定。调用中央权益后决定执行，无前端isPro参数信任，无本地到期算法。

默认不缓存付费允许结果；中央不可用返回可重试服务错误而非Free/放行。暂停/到期拒绝，公开页面可继续。未来额度扣减只能调用对应权威写入口，不把read features当原子配额扣减；本期不扩展未派发配额业务。

## 7. 安装与验证

Registry只列真实路由，复制BFF/SDK/授权示例与必要配置；先核对安装器支持服务端文件，再更新安装测试。新fixture平台接入不改中央业务代码。

测试无登录Pricing、激活/关闭/暂停、missing mapping、MFA/412、popup blocked、未知响应、人工状态、31位和历史码、支付后刷新；浏览器只读结果不直接授权。服务端测试允许/到期/暂停/中央超时，检查bundle无Key/SQL/token，API no-store。

已运行 account-server typecheck/unit、Template/Admin typecheck/build、Account API 定向测试、contracts/docs 检查；浏览器真实 Auth/Provider 会话、Registry 安装和生产购买仍 NOT_RUN。命令可参考现有test:sdk:m5-02、test:registry:m5-04、test:consumer:m5-05，但需在对应环境核实覆盖。


## 执行纪律与交付

开始前读取根 AGENTS.md、docs/README.md、docs/architecture/overview.md、docs/agents.md、[最新架构](../AisenFlow_Subscription_Billing_Architecture.md)、[总计划](../00-master-plan.md)、[交接规则](../agent-handoff.md)、[验证记录](../verification-record.md)，再读本阶段列出的合同和实际源码。文件名沿用历史路径，仅便于导航；任务编号与内容以当前 BILL 标题为准，不按旧 Phase 含义实施。

只执行用户实际派发阶段；计划不是后续开发、生产部署、真实付款或费用变更的自动授权。每阶段工作前核对 remote、branch、HEAD、status，保护其他修改；已授权仓库为 https://github.com/aisenhub/Aisenhubplatform.git。沿用任务分支，缺失时使用 codex/ 前缀。

Supabase 实施时读取适用技能、核对当前官方文档和固定 CLI（以当时 package/lock 为准），先 --help 再生成新增迁移；不修改已应用旧迁移。复用现有工具；系统软件自定义安装在 D:/APP/Codex/工具名，缓存放 E:/AppData/工具名，项目依赖按仓库约定，不默认安装到 C:。

本阶段列出的新增入口、文件和测试均为计划，不是已有能力。实现前核对实际路径；新增测试命令须同步 package.json，不能将不存在的命令或 pnpm test:api 占位记为 PASS。按变更运行对应 SQL/API/并发/恢复/SDK/UI 测试，以及 docs:check、contracts:check；代码变更运行适用 lint/typecheck/build。文档同步随阶段已实现事实推进，不能拖到最后才修公共合同。

验收后检查 staged diff 和敏感信息，仅提交本阶段文件；小提交、push 并核对远端 SHA，记录实际结果。未 push 不标已交付，不 force push、不重写共享历史、不自动合并 main、Release 或部署。验证分静态、本地运行、真实 Provider 联调、生产观察；未执行写 NOT_RUN。失败与复测保留，代码和记录更新可分开提交，避免追逐记录自身 SHA。
