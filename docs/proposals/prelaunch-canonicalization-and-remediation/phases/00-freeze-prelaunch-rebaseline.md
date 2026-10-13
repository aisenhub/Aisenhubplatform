# 阶段 00：冻结预上线 Rebaseline 边界

状态：验收通过待推送

## 目标

把“无正式数据、无需兼容”转换成可执行的工程边界，防止实施中又因为旧测试/旧合同临时保留双轨。

## 步骤

1. 记录 Local/Test/Staging/Production 实际使用状态；再次确认 Production 没有正式数据和已发布 Consumer。
2. 保存当前 migration history、Edge deployed version、OpenAPI operation count、canonical test counts 到 verification record，仅作审计证据，不作为兼容要求。
3. 冻结新的 canonical surfaces：
   - Account：Plans、Commerce Offers、offer_id Checkout、Configs/Gallery、Feedback、Account/Billing read；
   - Admin：单一 Plan/Commerce/Entitlement/Config/Governance surfaces；
   - 删除名单：fixed products、product_code checkout、legacy config-files、compat route aliases、retired private functions。
4. 明确当前测试平台和测试管理员数据全部可重建；建立最小 seed 需求清单。
5. 冻结“此次允许 breaking rebaseline，完成后恢复 strict compatibility”的一次性决策。

## 禁止事项

- 不在本阶段改业务代码。
- 不删除 Production 或未知环境数据。
- 不把历史 OPT verification PASS 当作新设计必须保留的行为。

## 验收

形成明确环境清单、canonical operation 清单、删除清单和 seed 清单；任何 destructive 操作前提均可核对。

## 冻结结果（2026-10-13）

- 任务级别：R3。后续阶段会修改数据库、公共 Contract、支付/权益、Storage 与 Admin 治理；阶段 00 本身仅冻结基线。
- Git：从 `main@65c52fb1162b549b2446550b2cda9367c94e9e4f` 创建 `codex/prelaunch-canonicalization-remediation`；创建时 `HEAD...origin/main = 0/0`。
- 既有工作区保护：`docs/README.md` 与 `docs/reviews/project-review-2026-10-13.md` 在本任务开始前已存在修改/未跟踪内容，实施期间不得覆盖或回滚。
- 环境：用户已确认项目未正式上线、无正式业务数据，仅有测试平台与管理员；当前连接账号只发现一个远程 Supabase 项目 `workendstaging`，没有独立 Production Supabase 项目。Production 仍明确禁止本 Proposal 执行任何 reset/deploy。
- Local：Supabase Docker 当前可用，API 为 loopback；仅记录本地服务状态，不把本地 Secret/Key 写入文档或日志摘要。
- 工具链：Node `24.19.0`、pnpm `11.18.0`、Deno `2.9.6`、Supabase CLI `2.111.0`。
- Migration：仓库当前 `112` 个 SQL migration，最新为 `20261012145252_commercial_operations_api_contract.sql`；Local 与 `workendstaging` migration history 均对齐到该版本。
- Edge 基线（仅审计记录）：`workendstaging` 的 `account-api` v63、`billing-webhook` v31、`maintenance` v39。该版本号不构成兼容要求。
- OpenAPI 基线（仅审计记录）：Account v1 `47` operations / contract `1.2.0`；Admin v1 `77` operations / contract `1.0.0`。
- 一次性 Contract 决策：本 Proposal 允许预上线 breaking rebaseline；阶段 07 建立新的 v1 baseline 后，重新恢复 strict `contracts:breaking`。

### Canonical surface

- Account：`/v1/plans`、`/v1/commerce/offers`、只接受 `offer_id` 的 Checkout、Config/Gallery、Feedback、Account/Profile/Preferences/Subscription/Billing read。
- Admin：单一 Plan/Offer/Price/Provider Mapping、Commerce Summary、Entitlement、Config/Gallery、Feedback、Account/Governance、Billing/Audit surface。
- Runtime 私有 SQL：每个领域只保留当前权威函数；最终 rebaseline 时可把 surviving versioned function 收敛成无版本号 canonical 名称。

### 删除清单

- fixed `subscription_products` 商品目录及 Monthly/Yearly/Lifetime enabled 开关；
- `product_code` Checkout、`legacy_product_code`、pre-migration checkout fallback 与旧 product mapping；
- Consumer/Admin legacy `config-files` 产品面与 `resource_kind='legacy'`；
- redemption `product_code` 创建路径与 retired v1/v2/v3 compatibility function/grant；
- `/admin/operations`、`/admin/deletion-jobs`、`/admin/billing` 等仅为兼容保留的旧 URL alias/redirect；
- raw timestamp Billing cursor、legacy redemption-code length compatibility、no-op compatibility helper 与只保护旧升级路径的测试/fixture。

### 最小可重建 seed 需求

阶段 07 的新 seed 至少覆盖：1 个 AAL2 system admin；2 个 active platform（独立 Origin/Platform Key）；每个平台至少 2 个普通账户；free + paid Plan；active Offer + immutable Price + verified Provider Mapping；一条可验证 Checkout/Order/Grant 链；一个 Config/Version/Gallery fixture；一个 Feedback fixture；一个 Redemption Campaign fixture。所有数据均为合成测试数据，可重复生成，不保存真实 Secret 或兑换码明文。
