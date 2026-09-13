# BILL-01 — 协议验证、决策与开发门槛

> 状态：G-DEV 已完成；G-PROVIDER 未运行。文档和本地合同已实施，真实渠道仍未联调。

## 1. 目标与前置

建立可靠的开发合同和真实渠道验证清单。本阶段不建支付生产表、不修改真实商品、不发起未经授权付款。现有中央后台与 SQL Ledger 是基础，不重新设计身份体系。

## 2. 阅读与核实

核对 package.json、pnpm-lock.yaml、supabase/config.toml、functions/_shared、maintenance、packages/domain/src/redemption.ts、最新SQL函数及 docs/reference/contracts.md、data-model.md、configuration.md、toolchain.md、guides/operations.md；必读用户提供的 [Afdian 调试参考](../afdian-debug-reference.md)。

记录源码HEAD、依赖固定版本、实际命令与已有基线失败。历史 d3c25e9 仅作研究背景。

## 3. 交付物与目录

- 在 verification-record 的协议矩阵保存官方来源、核验日期、协议字段、脱敏证据与结论；真实凭据不写文档。
- 固定 Adapter 输入/输出草案和明显虚构的 Provider fixture；建议 tests/spikes/billing/ 存本地协议探针。
- 可新增 _shared/afdian.crypto.test.ts 验证固定向量；不得把密码算法测试当真实Webhook协议证明。
- 冻结lifetime=finite/99/year、普通续购与Admin真永久兼容；确认渠道商品映射和数量验证不将99年本地权益误作渠道month，不新增永久起点专用修正。
- 补充迁移前决策：长期Checkout绑定、结算终态分类、correction链、保留/删除、旧链接行为和调度责任；权威定义写架构，具体参数写合同。

## 4. G-DEV 开发门槛

冻结Provider-neutral DTO、金额字符串、同平台同账户关系、固定商品期限、持久任务与结算状态草案、源操作和版本字段。模拟Adapter能表达成功、未知/失败、重复、迟到、金额/数量不匹配，不访问真实渠道。

检查Node/Deno实际支持的MD5与HMAC固定向量；只有当前官方证据确定RSA合同后才把对应验签作为要求。RSA不可用不应阻塞可安全走权威API确认的路径；若API请求签名本身无法运行则阻塞真实Adapter，不阻塞独立Catalog工作。

## 5. G-PROVIDER 真实渠道门槛

逐项核验并保留脱敏证据。用户当前调试样例没有 `custom_order_id`，因此在真实回传确认前不得自动绑定或授予权益：

| 项目 | 必须明确 |
|---|---|
| custom_order_id | 长度/字符、参数传递、回调和query回显、丢失行为 |
| 付款链接 | 重复使用、旧价结算、能否撤销；本地过期不是外部失效 |
| 商品 | plan/type/SKU全集/count/month、币种与展示/实付语义 |
| 优惠 | discount/redeem/零元与snapshot允许规则 |
| 信任 | 签名原文/算法/可信公钥/轮换；query-order账号与订单归属 |
| 恢复 | 延迟/重复回调、查询未知结果、限流、分页、历史可查范围 |

当前资料不足项标NOT_RUN/待确认，不编造Provider版本。真实最小付款和渠道配置需已有实际授权，否则记录缺口；G-DEV可先完成，本地工作可继续但purchasable保持false。

## 6. 验证与退出

运行实际Deno定向测试和可用runtime:probe，分别记录runtime结果与真实协议结果。G-DEV完成后交BILL-02；G-PROVIDER单列持续跟踪，未通过禁止启用真实购买。输出公开协议引用与脱敏样例，不上传完整个人支付数据或密钥。


## 执行纪律与交付

开始前读取根 AGENTS.md、docs/README.md、docs/architecture/overview.md、docs/agents.md、[最新架构](../AisenFlow_Subscription_Billing_Architecture.md)、[总计划](../00-master-plan.md)、[交接规则](../agent-handoff.md)、[验证记录](../verification-record.md)，再读本阶段列出的合同和实际源码。文件名沿用历史路径，仅便于导航；任务编号与内容以当前 BILL 标题为准，不按旧 Phase 含义实施。

只执行用户实际派发阶段；计划不是后续开发、生产部署、真实付款或费用变更的自动授权。每阶段工作前核对 remote、branch、HEAD、status，保护其他修改；已授权仓库为 https://github.com/aisenhub/Aisenhubplatform.git。沿用任务分支，缺失时使用 codex/ 前缀。

Supabase 实施时读取适用技能、核对当前官方文档和固定 CLI（以当时 package/lock 为准），先 --help 再生成新增迁移；不修改已应用旧迁移。复用现有工具；系统软件自定义安装在 D:/APP/Codex/工具名，缓存放 E:/AppData/工具名，项目依赖按仓库约定，不默认安装到 C:。

本阶段列出的新增入口、文件和测试均为计划，不是已有能力。实现前核对实际路径；新增测试命令须同步 package.json，不能将不存在的命令或 pnpm test:api 占位记为 PASS。按变更运行对应 SQL/API/并发/恢复/SDK/UI 测试，以及 docs:check、contracts:check；代码变更运行适用 lint/typecheck/build。文档同步随阶段已实现事实推进，不能拖到最后才修公共合同。

验收后检查 staged diff 和敏感信息，仅提交本阶段文件；小提交、push 并核对远端 SHA，记录实际结果。未 push 不标已交付，不 force push、不重写共享历史、不自动合并 main、Release 或部署。验证分静态、本地运行、真实 Provider 联调、生产观察；未执行写 NOT_RUN。失败与复测保留，代码和记录更新可分开提交，避免追逐记录自身 SHA。
