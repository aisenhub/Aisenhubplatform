# Consumer Integration Surface 重构计划

状态：Completed

关联架构：[`design.md`](./design.md)

验证记录：[`verification-record.md`](./verification-record.md)

起始基线：`main@58b4ef5a444b6c46015c712a4190076b7efbd36d`

风险等级：**R3**。影响 Consumer 公共合同入口、Admin 路由与导航、Registry、Harness/Conformance 周边工具和平台接入文档；不修改账户/Auth/Principal/Config/Feedback/Commerce 的领域语义。

## 1. 冻结边界

- [x] 不修改共享 Supabase Identity 与 Platform Account 关系。
- [x] 不修改 `contracts/account/v1/openapi.json` 的业务合同；任何合同语义变化必须停下并另立设计。
- [x] 不修改 private SQL 业务规则。
- [x] 不增加中央 Consumer runtime SDK。
- [x] 不引入 Admin Secret 输入、任意代理或手工 Conformance PASS。

## 2. Phase 01 — 建立 Integration Package 骨架

- [x] 创建 `platform-integration/README.md`，作为开发者唯一入口。
- [x] 创建 `platform-integration/AGENTS.md`，作为 AI 唯一入口。
- [x] 创建 `platform-integration/manifest.json`。
- [x] 创建 `platform-integration/ai/capabilities.json`。
- [x] 创建 `platform-integration/ai/rules.md` 与 `workflow.md`。
- [x] 创建 contract pointer、guides、example env、conformance 入口。
- [x] 所有 API schema 只链接 canonical OpenAPI，不复制 schema。

## 3. Phase 02 — 迁移 Developer 文档入口

- [x] 把现有 platform onboarding 的核心接入路径收敛到 `platform-integration/README.md` 和分主题 guides。
- [x] 保留 `docs/guides/platform-onboarding.md` 作为兼容入口并简化为跳转说明，避免旧链接断裂。
- [x] 更新 `docs/README.md`、架构文档和 contracts/reference 文档中的当前入口。

## 4. Phase 03 — 删除 Admin Consumer Lab

- [x] 删除 `/admin/consumer-lab` route。
- [x] 删除 `apps/admin/features/consumer-lab`。
- [x] 删除 Global navigation 中 Consumer Lab 项。
- [x] 更新 navigation tests。
- [x] 更新 `apps/admin/DESIGN.md` 与 `docs/architecture/modules/frontends.md`。
- [x] 删除专用于 Consumer Lab snapshot 的 build/generation 入口，并用 `platform-integration/validate.mjs` 承接 Integration Package/operationId 漂移检查；canonical OpenAPI checker 保持不变。

## 5. Phase 04 — Registry 与 Conformance 收敛

- [x] `registry/manifest.json` 移除 Admin Consumer Lab 元数据。
- [x] Registry 暴露 `platform-integration` 入口。
- [x] `platform-integration/conformance/README.md` 明确映射到 `tests/consumer-harness`。
- [x] 保留现有 Harness 安全与行为测试，不降低验证门槛。

## 6. Phase 05 — AI 接入协议校验

- [x] `manifest.json` 与 `capabilities.json` 可被 JSON parser 读取。
- [x] capability 中引用的 operationId 必须真实存在于 canonical OpenAPI。
- [x] capability 引用的 guide / conformance path 必须存在。
- [x] AI workflow 明确 server-only Platform Key、same-origin BFF、CSRF/Origin、bounded timeout、no-store、request_id、fail-closed。

## 7. Phase 06 — 文档与验证收口

- [x] 搜索仓库所有 `Consumer Lab` 当前态引用并分类：active architecture/reference/guides/runtime 已清理；历史 proposal/archive 保留为历史事实。
- [x] 搜索所有 `admin_consumer_lab` / `consumer_lab` registry/runtime 引用并清理。
- [x] 执行格式、文档、合同、Admin unit/typecheck/build、Consumer Harness static/process 验证。
- [x] Consumer Harness Local E2E 与最终 R3 gate：宿主 Windows 排除默认 `54321–54329` 端口后，使用仅限本次验证的临时 `55321–55329` Local Supabase 映射完成验收；仓库标准端口配置在验证后恢复，不纳入提交。
- [x] `git diff --check`。
- [x] 记录真实验证结果；失败项未伪造 PASS。

## 8. 完成定义

只有在以下条件同时满足时，本重构才能标记 Implemented：

1. `platform-integration/` 成为 AI 与开发者的唯一推荐 Consumer 接入入口。
2. Admin Consumer Lab 已完全退出当前产品面。
3. Registry 不再把 Consumer Lab 作为 Admin 能力暴露。
4. canonical OpenAPI 与现有 Consumer Harness 均保持通过。
5. 当前架构文档、开发指南与 Admin Design 已同步。
6. R3 本地验证通过，且没有触碰本计划明确排除的账户/业务领域模型。

全部完成定义已满足。`pnpm test:e2e:consumer-harness` PASS，`pnpm verify:task:0801 --reuse-local` 完成 22 个 executable gates 并 PASS；Proposal 标记 `Completed`。
