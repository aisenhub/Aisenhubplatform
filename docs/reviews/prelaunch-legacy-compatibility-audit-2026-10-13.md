# 预上线 Legacy / Compatibility 全面审查

审查日期：2026-10-13  
审查基线：`65c52fb1162b549b2446550b2cda9367c94e9e4f`  
范围：数据库 schema / SQL function、Account/Admin API、OpenAPI/Domain DTO、Admin UI/BFF、Consumer Harness、测试与设计文档中为了旧数据、旧接口、旧路由或迁移期双轨而保留的实现。

## 项目前提与审查结论

项目尚未正式上线，没有正式业务数据，当前只有测试平台与管理员。因此，本轮不再把“旧 Consumer 可继续工作”“non-empty 旧 schema 可平滑升级”“旧 URL 书签继续可用”作为产品约束。

在此前 OPT-001～OPT-010 的设计里，有多项明确冻结了 compatibility / additive / expand-first 策略。这些策略在“已有正式消费者和历史数据”的前提下是合理的，但当前项目阶段已经不需要承担它们造成的长期双轨复杂度。

本轮确认 **13 项兼容性清理问题**：

| ID | 清理优先级 | 范围 | 问题 |
| --- | --- | --- | --- |
| LC-01 | P1 | Commerce | 固定 `subscription_products` 仍作为 legacy 商品目录存在，并 bootstrap 为 Offer |
| LC-02 | P1 | Commerce/Admin | `platform_subscription_config` 继续维护 paid Plan + Monthly/Yearly/Lifetime 开关，与 Offer 生命周期重复 |
| LC-03 | P1 | Checkout/Contract | Checkout 同时支持 `product_code` 与 `offer_id`，并保留 pre-migration fallback 与双响应 schema |
| LC-04 | P1 | Provider Mapping | Mapping 同时支持 `subscription_product_id` 与 `commercial_price_id` 两类目标 |
| LC-05 | P1 | Config | `/v1/config-files` 与 Config Version 并存，`resource_kind=legacy|config_version` 把迁移兼容写进核心 Storage 状态机 |
| LC-06 | P2 | Redemption | Campaign 创建同时保留 Plan、legacy `product_code`、Offer 三条写路径 |
| LC-07 | P2 | SQL/API | 多代 v1/v2/v3 私有函数仍同时存在且部分继续授予 executor 权限 |
| LC-08 | P2 | Billing | Billing order cursor 仍接受旧 raw timestamp，并在运行时切回旧 SQL list function |
| LC-09 | P2 | Admin UI/Routes | 旧 Operations、Deletion Jobs、Billing URL 仍保留 redirect/duplicate page/alias |
| LC-10 | P2 | Config/Admin | Admin 仍暴露 legacy `config-files` 运维 API，而不是只围绕 Config/Version 权威资源诊断 |
| LC-11 | P2 | Redemption | Redemption Code 实现仍接受 16～128 字符 legacy 长度，和当前 31 字符/公开合同不一致 |
| LC-12 | P3 | DB | `billing_lifetime_purchase_guard` 已成为 no-op，但仅为 migration compatibility 继续存在 |
| LC-13 | P2 | Tests/Docs/Migrations | 大量 non-empty upgrade / legacy bootstrap / compatibility gate 继续把已废弃双轨当成发布验收目标 |

这里的 P1/P2/P3 表示**清理优先级**，不是重新给功能 Bug 定级。

---

## LC-01｜P1：固定 `subscription_products` legacy 商品目录仍是正式运行模型

**证据**

- `supabase/migrations/20260911120819_bill_02_subscription_product_catalog.sql:1-42` 创建固定 `free/monthly/yearly/lifetime` 商品目录并保存价格、期限、推荐状态。
- `supabase/migrations/20261012114256_commercial_operations_domain.sql:1-2` 明确写明 fixed `subscription_products` 保留为 legacy compatibility surface。
- 同 migration `158-190` 会把旧 monthly/yearly/lifetime 自动 bootstrap 成 `platform_commercial_offers` + Price。
- `supabase/functions/account-api/account.ts:51-76` 仍正式提供 `GET /v1/subscription/products`。
- `contracts/account/v1/openapi.json:76-105` 将该 endpoint 定义为 backward-compatible fixed product catalog。

**为什么现在是问题**

Offer / Price 已经是更通用的商业目录。如果固定商品仍作为正式源存在，就必须永久维护：固定 code、固定 term、固定 price_version、legacy Offer 关联、fixed catalog readiness 与新 Offer readiness 的一致性。

**预上线清理方向**

删除 `subscription_products` 业务表及其 guard/list DTO/API；需要 Free Plan 的地方直接读 Plan；付费售卖全部由 Offer + Price 表达。不再 bootstrap “legacy-*” Offer。

---

## LC-02｜P1：`platform_subscription_config` 与 Offer 生命周期重复表达商业可用性

**证据**

- `20260911120819_bill_02_subscription_product_catalog.sql:44-65` 的 `platform_subscription_config` 保存 `paid_plan_id`、`monthly_enabled`、`yearly_enabled`、`lifetime_enabled`。
- `20260914223608_repair_task_d3_lifecycle.sql:224-360` 的 v2 read/patch 又加入 `purchases_paused`，但继续维护三个 fixed-product boolean。
- `supabase/functions/account-api/admin.ts:2084-2132` 当前 Admin API 仍要求这些 boolean。
- `apps/admin/features/platform-settings/subscription-config-panel.tsx:28-45,119-127,173-179,289-315` 仍让管理员配置固定 Monthly/Yearly/Lifetime。
- `contracts/admin/v1/openapi.json:3892-3960` 继续把这些字段作为 required contract。

**为什么现在是问题**

Offer 已经拥有 `draft/active/archived`，Price 和 Mapping 又决定 purchase readiness。三个固定开关形成第二套“商品是否可卖”的状态源；`paid_plan_id` 又暗示“平台只有一个标准付费 Plan”，与 OPT-010 支持多个 Paid Plan/Offer 的目标冲突。

**预上线清理方向**

删除 `monthly_enabled/yearly_enabled/lifetime_enabled` 与单一 `paid_plan_id` 兼容映射。`purchases_paused` 若仍需要作为平台级总开关，应独立成明确的 Commerce policy；`subscription_copy_override` 若仍有产品价值，也应迁移到独立 Commerce presentation/config，而不是继续绑在旧 fixed-product 配置表上。

---

## LC-03｜P1：Checkout 是 legacy/new 双入口、双落库、双响应合同

**证据**

- `apps/account-api/account.ts` 当前实现实际位于 `supabase/functions/account-api/account.ts:171-219`：请求必须在 `product_code` 和 `offer_id` 中二选一。
- `contracts/account/v1/openapi.json:2265-2285` 同样定义 `product_code XOR offer_id`。
- `20261012145252_commercial_operations_api_contract.sql:432-455`：没有 `offer_id` 时先按 `legacy_product_code` 找 Offer；找不到还会调用旧 `private.subscription_checkout_create` 做 pre-migration fallback。
- 同文件 `467-507`：可继续解析旧 `subscription_products`、旧 Mapping，并把 legacy `product_code` 与新 `commercial_offer_id/commercial_price_id` 同时写入 Checkout。
- `contracts/account/v1/openapi.json:2768-2948` 为 Checkout response 保留完整 legacy schema 与 Commerce schema 的 union。
- OPT-010 设计 `design.md:93-118` 明确说明这是为兼容期保留的双路合同。

**为什么现在是问题**

同一购买动作存在两套输入、两套目录解析、两类 Provider Mapping、两类 attribution 和两种响应分支。每新增一个购买约束，都必须确认两个入口完全一致，正是长期高风险状态组合。

**预上线清理方向**

Checkout 只接受 `offer_id`；`commercial_offer_id`、`commercial_price_id` 成为 canonical attribution；删除 `product_code` 输入、legacy fallback、legacy response union 以及与 fixed product 关联的双写列/分支。

---

## LC-04｜P1：Provider Mapping 仍支持两类业务目标

**证据**

- `20261012114256_commercial_operations_domain.sql:192-207` 给已有 Mapping additive 增加 `commercial_price_id`，并明确保留旧 Mapping 行为。
- `20261012145252_commercial_operations_api_contract.sql:4-16` 允许 Mapping 通过旧 `subscription_product_id` 或新 `commercial_price_id` 表示 catalog target。
- 同文件 `472-485` Checkout 解析 Mapping 时同时接受 `m.commercial_price_id = v_price.id` 或 `m.subscription_product_id = v_product.id`。

**为什么现在是问题**

Mapping 本质上应该明确回答“某 Provider SKU 对应哪个当前 Price”。双 target 让唯一性、切换、immutable snapshot、校验和故障诊断都需要额外分支，也放大 R-03 的切换复杂度。

**预上线清理方向**

Mapping 只允许 `commercial_price_id`；删除 `subscription_product_id` target 和旧 lookup 分支。随后把 R-03 修成 Price scope 内原子 switch。

---

## LC-05｜P1：Config 领域把旧 `/v1/config-files` 兼容写进核心 Storage 状态机

**证据**

- `docs/proposals/config-resource-system/design.md:35-49` 明确冻结：保留 `/v1/config-files`，旧行标记 `legacy`，新 Config Version 标记 `config_version`。
- `20261011024824_config_resource_domain.sql:13-21` 给 `platform_config_files` 增加 `resource_kind`，取值 `legacy|config_version`。
- `20261011025311_config_resource_domain_functions.sql:1-3` 明确标记为 compatibility layer；大量 file primitive 只处理 `resource_kind='legacy'`。
- `20261011052654_config_resource_account_content.sql:1-3` 继续保留 legacy upload primitives，并为核心 Storage primitive 增加 `p_resource_kind` 分派。
- Account runtime、OpenAPI 和 Consumer Harness 仍保留六个 `/v1/config-files...` operation；新 `/v1/configs...` 又单独存在。
- 旧 `max_files/max_total_bytes` 账户文件额度也只因 legacy surface 保留，Config 正式额度已经使用 entitlement `config_slot_limit` + 平台物理容量。

**为什么现在是问题**

这不是简单保留一个 URL，而是让整个 Storage write/fencing/finalize/delete 状态机永久认识两种产品资源类别；所有容量、删除、Global Delete、unknown-outcome 流程都必须验证 legacy/config_version 两路。

**预上线清理方向**

删除 Consumer `/v1/config-files` 产品面和 legacy 行语义；Storage ledger 只作为 Config Version 的物理实现。若 `platform_config_files` 仍保留作内部 ledger，可以移除 `resource_kind`，或把它变成不参与兼容分派的内部固定语义。删除只服务 legacy 文件产品的账户级 `max_files/max_total_bytes` 和 wrapper。

---

## LC-06｜P2：Redemption Campaign 保留三条创建模型

**证据**

- `supabase/functions/account-api/admin.ts:2135-2251` POST `/redemption-batches` 要求 `plan_id / offer_id / product_code` 三者恰好一个，并分别调用：
  - Offer → `admin_batch_create_v3`
  - legacy product code → `admin_batch_create_v2`
  - direct Plan + duration → `admin_batch_create`
- `20260911124902_bill_03_redemption_v2_lifecycle.sql:65-217` 的 v2 完全依赖 `platform_subscription_config + subscription_products + product_code`。
- OPT-010 设计 `commercial-subscription-operations/design.md:156-158` 当前正式目标只需要 Offer 或 Admin-defined `plan_id + duration`。

**为什么现在是问题**

`product_code` 分支已经没有独立产品价值，只是兼容 fixed catalog；它让 Campaign snapshot、model_version、过滤器和测试继续承担第三套语义。

**预上线清理方向**

删除 product_code/v2 路径。保留真正有业务意义的两种创建方式：Offer-based Campaign；以及明确标记为 Admin-defined 的 `plan_id + duration` 补偿/运营权益。

---

## LC-07｜P2：多代 SQL function 同时存活并保留执行面

**已确认样例**

1. Audit：`20261010092449_admin_audit_list_v2.sql:1-2` 明确“Keep admin_audit_list(v1) intact for rollback/compatibility”；当前 API 已只调用 v2，但 v1 仍存在并有旧测试。
2. Account transition：OPT-009 设计明确“旧 transition 保留兼容；新 API/UI 切到 v2”；当前 API 调 v2，旧 `private.admin_account_transition` 仍有 executor grant/测试。
3. Subscription config：`20260914223608_repair_task_d3_lifecycle.sql:221-223` 明确旧 read/patch signature 为 older callers 保留；v1/v2 都继续授权 Admin executor。
4. Billing orders：旧 `admin_billing_order_list`、`admin_billing_order_read` 与 v2/v3 同时存在；当前详情已到 v3，列表仍会因 legacy cursor 回退旧 list。
5. Redemption：`admin_batch_create` / v2 / v3 同时成为一个 HTTP route 的运行分支。
6. Config file primitives：大量 `*_by_kind` + legacy wrapper 并存，只为旧 `/config-files` 保持原 signature。

**为什么现在是问题**

private function 虽不是公网 API，但 executor grant 仍是实际能力面。旧函数继续存在会：

- 形成绕过最新业务检查的机会；
- 让测试不得不维护两代/三代实现；
- 让开发者无法判断哪个 function 才是权威入口；
- 增加 future security regression 面。

**预上线清理方向**

删除未被 canonical runtime 需要的旧函数/grant/test；幸存实现可在 prelaunch rebaseline 时去掉 `_v2/_v3` 后缀，恢复无版本号的权威命名。

---

## LC-08｜P2：Billing cursor 仍接受旧 raw timestamp 并切换旧 SQL

**证据**

- `supabase/functions/account-api/core.ts:872-908`：canonical cursor 是 `v1.<base64>` 的 `(created_at, order_id)`；但非 `v1.` 输入仍尝试解析为 legacy Date。
- `supabase/functions/account-api/admin.ts:614-669`：legacy cursor 会调用旧 `private.admin_billing_order_list`；canonical cursor 才调用 `admin_billing_order_list_v2`。legacy cursor 还必须禁止新 filters。

**为什么现在是问题**

一个纯粹为了旧客户端的输入格式让 endpoint 运行时维护两套查询和两套参数能力。

**预上线清理方向**

只接受 opaque canonical cursor；删 raw timestamp parser、legacy union type 和旧 list 调度。删除不再需要的旧 list function。

---

## LC-09｜P2：Admin 旧 URL 仍保留兼容 redirect / duplicate page / alias

**证据**

- `apps/admin/app/admin/operations/page.tsx` 与 `/admin/deletion-jobs/page.tsx` 都只是 redirect 到 `/admin/accounts/deletion-jobs`。
- `apps/admin/app/admin/_lib/deletion-jobs-route.ts` 专门保留旧 query 参数兼容。
- `apps/admin/components/navigation/admin-navigation.ts:67-71` 将 `/admin/billing` 作为 `/admin/billing/orders` alias。
- `/admin/billing/page.tsx` 与 `/admin/billing/orders/page.tsx` 都直接渲染同一个 `CentralBillingPage`。
- `apps/admin/DESIGN.md`、`docs/architecture/overview.md` 和 frontends 架构文档仍明确描述这些旧路由为 compatibility surface。

**为什么现在是问题**

虽然风险低于数据库双轨，但它增加路由矩阵、导航 active-state、E2E 和 URL 状态转换测试。项目未上线，不存在必须保留的历史书签。

**预上线清理方向**

只保留 canonical URL；删除 redirect 页面、alias、compat route helper 与对应测试/文档。

---

## LC-10｜P2：Admin 仍公开 legacy `config-files` 运维 API

**证据**

- `supabase/functions/account-api/admin.ts:542-563` 仍暴露 `GET /admin/api/v1/config-files`，调用 `admin_file_list_v3`。
- Admin BFF allowlist 仍允许 `config-files` list/detail/content/delete。
- `apps/admin/features/files/platform-files-page.tsx` 仍直接调用这些 legacy API 做列表、下载和删除。
- Config 设计虽然把页面主视图升级为 Config 资源，但仍为兼容保留“legacy 文件”技术区。

**为什么现在是问题**

技术 Storage Inspector 本身有价值，但不应该以旧“用户私有文件产品”的 API 继续暴露。否则删除 LC-05 后还会被 Admin API 迫使保留 legacy DTO/function。

**预上线清理方向**

保留必要的 Config Version Storage 诊断能力，但改成 Config/Version scoped Admin read/diagnostic endpoint；删除 generic legacy config-file CRUD surface。

---

## LC-11｜P2：Redemption Code 仍兼容 16～128 字符旧长度

**证据**

- `packages/domain/src/redemption.ts:13-23` normalize 接受 16～128 字符。
- 同文件 `84-104` generator 也允许调用方生成 16～128 长度，默认才是 31。
- `packages/domain/tests/billing.test.ts:202-228` 测试标题直接写“retaining legacy length bounds”，并显式生成 16 与 128 字符旧码。
- 当前 Account OpenAPI Redeem request 则已经收紧为 26～64 字符，形成内部实现和公开合同的不一致窗口。

**为什么现在是问题**

没有历史兑换码需要继续消费时，继续接受超出当前产品格式的旧码只会增加输入空间、测试矩阵和暴力猜测/日志分析的复杂度。

**预上线清理方向**

冻结一个 canonical 长度（当前 generator 默认 31 最自然），normalize/validate/generate/OpenAPI/测试统一；若产品确实希望允许显示分隔符，只在 normalization 前后的表示层处理，不保留旧长度区间。

---

## LC-12｜P3：No-op lifetime guard 仅因 migration compatibility 存在

**证据**

- `20260914115740_repair_task_d1_repeat_lifetime.sql:9-21` 注释明确：保留旧 helper 只为 migration compatibility/observability；函数体只有 `return new`。
- 对应 trigger 已在该 migration 开头被 drop。

**为什么现在是问题**

这是没有运行职责的死数据库对象，名称却仍暗示存在 lifetime purchase policy，容易误导后续审查/维护。

**预上线清理方向**

在 clean baseline 中完全移除，不迁移到最终 schema。

---

## LC-13｜P2：验证体系仍把“旧 schema/旧 Consumer 不破坏”作为正式门槛

**证据**

- OPT-007 Phase 01 明确要求 legacy file fixture 非空升级、legacy visibility 与旧 Consumer contract PASS。
- OPT-010 Phase 01/02 明确要求 legacy paid plan/provider/checkout/order/grant/redemption fixture 升级、bootstrap legacy Offer、legacy/new checkout 同时通过。
- `commercial-subscription-operations/verification-record.md` 多次把 non-empty legacy upgrade 和完整保留旧 response schema 作为 canonical PASS 证据。
- Consumer Harness 仍把 `/v1/config-files` 与旧 fixed-product surface 纳入 canonical operation 集。

**为什么现在是问题**

只要这些测试仍被定义为“必须 PASS”，工程师就无法真正删除兼容层；测试会反过来把临时迁移策略固化成永久产品需求。

**预上线清理方向**

在一次性 prelaunch contract/schema rebaseline 后：

- 删除只证明旧数据/旧 wire contract 可升级的 compatibility fixtures；
- Consumer Harness 改为只包含新的 canonical operations；
- fresh DB / destructive reseed 成为当前阶段的权威验证路径；
- 正式上线以后再重新启用严格 expand/migrate/contract 和 non-empty upgrade 纪律。

---

## 不应误删的内容

### 1. Contract compatibility 机制本身应保留

`contracts/account/v1/COMPATIBILITY.md`、`contracts/admin/v1/COMPATIBILITY.md`、breaking checker、Consumer Harness、Registry 的**治理机制不是问题**。问题是它们当前把尚未上线的临时旧合同当成永久基线。

正确做法是：这次清理作为一次**预上线 breaking rebaseline**，生成新的 canonical Account/Admin v1 基线；从该基线开始继续严格执行 compatibility/breaking gate。

### 2. 历史事实不可变原则仍应保留

“无需旧数据兼容”不等于未来可以随意改写 Checkout/Order/Grant/Audit 等历史事实。正式上线后的不可变 snapshot、Grant ledger、Audit、Settlement 等设计原则继续成立。

### 3. 安全边界不能因为清理而放松

删除 wrapper/旧路径时，应保留：RLS/force RLS、固定 `search_path`、executor 最小授权、recent-MFA、If-Match、idempotency、跨平台 ownership 检查与 fail-closed 行为。

## 总结

当前最大兼容负债不是迁移文件数量，而是**同一业务动作存在多套权威表达**：

1. 商品：fixed product 与 Offer/Price；
2. Checkout：product_code 与 offer_id；
3. Mapping：subscription_product 与 commercial_price；
4. Config：legacy file 与 Config Version；
5. SQL/API：v1/v2/v3 多代入口；
6. URL：canonical 与 compatibility alias/redirect。

项目现在正处于最适合一次性收敛这些双轨的阶段。继续保留它们，之后每一个 Bug 修复都需要多修一套路径；先删除兼容层，再修剩余 canonical 路径，整体风险和代码量都会更低。
