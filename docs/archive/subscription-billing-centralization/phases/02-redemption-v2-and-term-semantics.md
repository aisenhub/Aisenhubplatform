# BILL-02 — Catalog、平台映射与公共合同

> 状态：本地实现已验收，真实 Provider/生产运维未运行。

## 1. 目标与依赖

依赖G-DEV。交付Catalog→受控Admin配置→Products API→服务端SDK读取的本地闭环；真实渠道未就绪时所有实际购买关闭。

## 2. 源码与变更位置

复用20260907125544_t15_profile_preferences_plans.sql、20260907142148_m3_plan_management.sql对应现有Plan过程、account-api/index.ts、domain/src/contracts、account-server/src/index.ts、Admin plans/platform workspace。

新增CLI生成catalog/config migration、supabase/tests/subscription_product_catalog.sql；修改docs/reference/contracts下Account/Admin OpenAPI、DTO、Account API、server SDK与最小Admin配置UI，相关文档随实现同步。

## 3. 数据与版本

subscription_products固定free/monthly/yearly/lifetime；code/term/duration不可由Admin修改。Free price=0/term=free；monthly=1month、yearly=1year、lifetime=finite/99/year（monthly/yearly同为finite）。金额numeric(12,2)/CNY、API十进制字符串；价格版本、文案白名单、状态和row_version受控更新。

platform_subscription_config以platform_id为PK；paid_plan_id使用同平台FK；开关与copy override白名单。Free仅来自platforms.default_plan_id。仅恰好一个active paid Plan可自动回填；其余null且购买关闭，不猜测/删除历史Plan。

目录价格发布与Provider映射发布是两件事。BILL-04增加不可变mapping版本；本阶段定义price_version接口，不承诺改中央价格即更新外部渠道。未有可验证匹配mapping时purchasable=false。

## 4. Plan 切换与归档

同平台锁下验证目标active/paid，当前/未来不同Plan Grant阻止切换。定义共享preflight返回阻塞类型与脱敏数量；还须覆盖仍可兑换旧Plan批次、未结订单及可能到账旧Checkout。

本期选择：存在可兑换旧Plan批次时阻止切换，须过期或经授权禁用未使用批次；不得重映射旧码。Billing表尚未存在时先实现Grant/Batch检查，BILL-04必须扩展Checkout/Order检查后才可启用付款。不可撤销旧外链按架构转人工处理策略，不能无限假设已排空。

标准商品启用时配置的paid Plan不可归档；检查在SQL内，不能只禁用UI。并发创建批次/Grant/Checkout与切换必须同平台锁序列化。

## 5. API/UI

GET /v1/subscription/products不要求Bearer但要求服务端Platform Key；返回code/name/price/currency/term/recommended/enabled/purchasable/reason，不暴露provider ID。旧GET /v1/plans不改义。

Admin subscription-config GET/PATCH复用现有Admin上下文、recent MFA、If-Match/412、reason/audit；具体路径按现有路由规范冻结。前端显示未配置、歧义、平台停用、保存中、MFA、并发冲突和unknown outcome；成功重新GET，不本地假成功。

## 6. 实施与验证

先只读预检→schema/约束/SQL wrapper→SQL负向测试→DTO/OpenAPI→API/SDK→最小Admin UI。测试四商品不变量、lifetime固定99year且拒绝NULL/其他时长、展示99年而非真永久、跨平台FK、RLS/任意DML拒绝、历史Plan保留、切换与批次创建并发、价格版本/412、旧plans回归。

运行对应SQL/API/SDK和Admin最小闭环；本阶段完成时交出固定schema/DTO与待BILL-04扩展的Billing preflight接口，purchasable不得伪造。


## 执行纪律与交付

开始前读取根 AGENTS.md、docs/README.md、docs/architecture/overview.md、docs/agents.md、[最新架构](../AisenFlow_Subscription_Billing_Architecture.md)、[总计划](../00-master-plan.md)、[交接规则](../agent-handoff.md)、[验证记录](../verification-record.md)，再读本阶段列出的合同和实际源码。文件名沿用历史路径，仅便于导航；任务编号与内容以当前 BILL 标题为准，不按旧 Phase 含义实施。

只执行用户实际派发阶段；计划不是后续开发、生产部署、真实付款或费用变更的自动授权。每阶段工作前核对 remote、branch、HEAD、status，保护其他修改；已授权仓库为 https://github.com/aisenhub/Aisenhubplatform.git。沿用任务分支，缺失时使用 codex/ 前缀。

Supabase 实施时读取适用技能、核对当前官方文档和固定 CLI（以当时 package/lock 为准），先 --help 再生成新增迁移；不修改已应用旧迁移。复用现有工具；系统软件自定义安装在 D:/APP/Codex/工具名，缓存放 E:/AppData/工具名，项目依赖按仓库约定，不默认安装到 C:。

本阶段列出的新增入口、文件和测试均为计划，不是已有能力。实现前核对实际路径；新增测试命令须同步 package.json，不能将不存在的命令或 pnpm test:api 占位记为 PASS。按变更运行对应 SQL/API/并发/恢复/SDK/UI 测试，以及 docs:check、contracts:check；代码变更运行适用 lint/typecheck/build。文档同步随阶段已实现事实推进，不能拖到最后才修公共合同。

验收后检查 staged diff 和敏感信息，仅提交本阶段文件；小提交、push 并核对远端 SHA，记录实际结果。未 push 不标已交付，不 force push、不重写共享历史、不自动合并 main、Release 或部署。验证分静态、本地运行、真实 Provider 联调、生产观察；未执行写 NOT_RUN。失败与复测保留，代码和记录更新可分开提交，避免追逐记录自身 SHA。
