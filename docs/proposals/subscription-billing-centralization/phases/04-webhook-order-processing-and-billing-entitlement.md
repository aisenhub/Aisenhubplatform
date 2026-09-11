# BILL-04 — Checkout、订单、Inbox 与持久任务

> 状态：未开始。文档已按最新架构修订，不代表功能实施或联调完成。

## 1. 目标与依赖

依赖BILL-03的Ledger、生命周期与锁合同。交付可恢复Checkout和持久支付工作基础；真实权威订单处理由BILL-05完成。无G-PROVIDER时只能本地模拟，真实购买关闭。

## 2. 变更目录与边界

CLI新增provider accounts/products版本、checkout、orders、inbox、processing jobs、settlement/correction关联迁移及supabase/tests/billing_core.sql。修改domain/contracts、Account/Admin OpenAPI、account-api、account-server与_shared/billing；新增billing-webhook接收入口和最小maintenance任务领取入口。

公开表enable/force RLS；定义独立受控Webhook入口角色，用户/Admin/job权限分离，禁止直接任意DML或授予entitlement_apply。函数owner/search_path/revoke/grant明确，负向权限测试不可省略。

## 3. Schema 不变量

- Provider Account V1仅一套active；secret_reference为逻辑配置名，密钥不入表。
- Mapping具有不可变revision、price_version、验证状态、plan/type、SKU全集/count、month、金额/币种/优惠策略；同account/product/revision唯一，当前有效发布指针唯一，不能以account/product唯一阻止历史版本。
- lifetime快照固定finite/99/year，不接收客户端自定义时长；已有99年授权不禁购，已有Admin真永久仍阻止Checkout。渠道month/SKU数量按已验证mapping核验，不将本地99年时长直接当作渠道month。
- Checkout保存不可变商业snapshot、provider/plan/account复合关联、token_key_version、token_digest唯一及派生输入、付款窗口；状态由本地事实派生。
- Order以provider account/order_no唯一；unlinked允许归属组为空，关联后由复合FK保证同platform/account/checkout。未知渠道时间为空，不用接收时间冒充付款时间。
- 结算表/事实将原订单、Checkout自动结算槽位、效果和后续修正关联；同Checkout最多一笔自动结算，不限制第二笔真实订单入库。
- 处理任务包含state、attempts、next_attempt_at、lease_owner、fence、error_class/code及人工状态；Inbox与任务同事务建立。

## 4. Checkout HMAC 恢复和幂等

按架构§11使用独立带版本HMAC密钥、canonical encoding与完整摘要，不随意截短。应用层在事务外计算候选UUID/Token摘要，DB在短事务选定最终Checkout并写snapshot/摘要/版本；竞争输家按既有Checkout元数据重新派生，不使用本次候选Token。无网络调用或密钥写入SQL。

长期操作绑定保存scope/key或不可逆键摘要、request_hash、checkout_id，与7天普通响应缓存分离；保留至少随Checkout及约定交易去重周期。清理响应缓存不允许同scope/key产生另一Checkout，参数不同仍冲突；身份删除按生命周期匿名保留，不能重新授权旧身份。

POST重新鉴权后重放当前权威状态。只有无已确认付款且窗口结束才expired；已付/granted不回退。已结算、不允许付款或过期时不再返回payment_url。未知响应重试同ID/同有效链接。密钥轮换保留恢复窗口旧版本；密钥丢失/泄露明确拒绝签发但旧Token摘要仍可关联迟到款。

## 5. 入站与持久恢复

bounded body/method/content-type→最小发现字段/hash→Inbox+任务提交→ACK。提交失败不ACK；重复事件不产生无界任务，但也不能压掉既有任务重试。

只存order_no/hash时须已证明query可重建验证事实；否则必要白名单短期加密保留并指定TTL/角色/清理。Worker崩溃或进程退出不依赖内存任务；租约过期接管，旧fence不能完成任务。禁止把本地接收成功展示成已授权。

## 6. API与兼容

POST checkout仅product_code+Idempotency-Key；拒绝注入platform/account/price/provider字段。GET需Bearer+Platform Key，非归属404、no-store，只读本地状态。paid/review_required/resolved按架构§48统一，不继续使用旧failed/already_entitled作为Checkout成功枚举。

补BILL-02 preflight：未结订单/旧Checkout与批次阻止无计划切换；归档/调价不能改变snapshot。补BILL-03 correction与订单FK、删除/清理实际步骤；不得等最终验收才发现结构不兼容。

## 7. 验证与交接

测试99年快照不可变、NULL时长注入拒绝、99年可续购与Admin真永久禁购；测试提交后响应丢失、并发同键、异参数、清理7天缓存后重放、到期granted不降级、密钥轮换/缺失、同平台跨账户FK、旧价新版本并存。

测试ACK前DB失败、ACK后崩溃、接管fence、任务重复、极大/非法Payload、URL不入日志/缓存、Auth删除与入站竞态。完成本地products→checkout→持久inbox/job→接管链，真实授权留BILL-05，不假报granted。


## 执行纪律与交付

开始前读取根 AGENTS.md、docs/README.md、docs/architecture/overview.md、docs/agents.md、[最新架构](../AisenFlow_Subscription_Billing_Architecture.md)、[总计划](../00-master-plan.md)、[交接规则](../agent-handoff.md)、[验证记录](../verification-record.md)，再读本阶段列出的合同和实际源码。文件名沿用历史路径，仅便于导航；任务编号与内容以当前 BILL 标题为准，不按旧 Phase 含义实施。

只执行用户实际派发阶段；计划不是后续开发、生产部署、真实付款或费用变更的自动授权。每阶段工作前核对 remote、branch、HEAD、status，保护其他修改；已授权仓库为 https://github.com/aisenhub/Aisenhubplatform.git。沿用任务分支，缺失时使用 codex/ 前缀。

Supabase 实施时读取适用技能、核对当前官方文档和固定 CLI（以当时 package/lock 为准），先 --help 再生成新增迁移；不修改已应用旧迁移。复用现有工具；系统软件自定义安装在 D:/APP/Codex/工具名，缓存放 E:/AppData/工具名，项目依赖按仓库约定，不默认安装到 C:。

本阶段列出的新增入口、文件和测试均为计划，不是已有能力。实现前核对实际路径；新增测试命令须同步 package.json，不能将不存在的命令或 pnpm test:api 占位记为 PASS。按变更运行对应 SQL/API/并发/恢复/SDK/UI 测试，以及 docs:check、contracts:check；代码变更运行适用 lint/typecheck/build。文档同步随阶段已实现事实推进，不能拖到最后才修公共合同。

验收后检查 staged diff 和敏感信息，仅提交本阶段文件；小提交、push 并核对远端 SHA，记录实际结果。未 push 不标已交付，不 force push、不重写共享历史、不自动合并 main、Release 或部署。验证分静态、本地运行、真实 Provider 联调、生产观察；未执行写 NOT_RUN。失败与复测保留，代码和记录更新可分开提交，避免追逐记录自身 SHA。
