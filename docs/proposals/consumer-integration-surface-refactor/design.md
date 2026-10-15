# Consumer Integration Surface 重构架构

状态：Completed

> 本文件先冻结此次重构的架构边界；实现计划见同目录 `plan.md`。本次只重构 Consumer Integration Surface，不修改现有共享 Identity、Platform Account、Principal、Config、Feedback、Commerce 等领域模型。

## 1. 目标

将当前分散在 Admin Consumer Lab、Consumer Harness、平台接入指南、Registry 与 canonical OpenAPI 中的 Consumer 接入信息，收敛为仓库内单一、可复制、可验证的 `platform-integration/` 接入包。

该接入包同时服务两类使用者：

1. AI Agent：获得结构化入口、能力清单、强制规则、执行顺序与验证命令，不需要扫描整个仓库推断接入方式。
2. 人类开发者：通过 README 与分主题指南理解如何把一个新平台接到 AisenHub 中央 HTTP 能力。

## 2. 非目标

- 不改变 Supabase Auth 共享 Identity 模型。
- 不改变 `platform_accounts`、Principal 或平台级数据隔离语义。
- 不改变 Config、Feedback、Commerce、Entitlement、Lifecycle 的领域事实或 private SQL 权威边界。
- 不引入中央 Consumer runtime SDK，也不允许浏览器直接接触 Platform Key、中央 SQL、Storage 或特权 API。
- 不把 Admin 改造成 Consumer 请求代理、Secret 管理器或目标平台运行时验证器。
- 不把 Conformance PASS 与生产发布授权等价。

## 3. 当前问题

当前 Consumer 接入知识分散在多个位置：

- `/admin/consumer-lab` 只读展示 canonical contract 与 Harness 边界，但没有真实业务管理价值。
- `tests/consumer-harness` 是有效的 conformance fixture，但其目录语义更像内部测试，而不是完整的平台接入入口。
- `docs/guides/platform-onboarding.md` 提供人工说明，但 AI 仍需要跨目录理解合同、环境变量、Harness 与安全约束。
- `registry/manifest.json` 同时记录 Admin Consumer Lab 与 Harness，形成不必要的产品面概念。
- OpenAPI 是 canonical HTTP contract，但缺少 capability → operationId → 文档 → conformance 的机器可读索引。

因此此次优化的核心不是新增 Consumer 功能，而是建立一个仓库级的 **Integration Package**。

## 4. 目标目录

```text
platform-integration/
├─ README.md
├─ AGENTS.md
├─ manifest.json
├─ ai/
│  ├─ capabilities.json
│  ├─ rules.md
│  └─ workflow.md
├─ contracts/
│  └─ account/
│     └─ v1/
│        └─ README.md
├─ guides/
│  ├─ quick-start.md
│  ├─ authentication.md
│  ├─ account.md
│  ├─ authorization.md
│  ├─ config.md
│  ├─ feedback.md
│  ├─ commerce.md
│  ├─ files.md
│  └─ errors-observability.md
├─ examples/
│  └─ env.example
└─ conformance/
   └─ README.md
```

说明：canonical OpenAPI 继续保留在 `contracts/account/v1/openapi.json`。`platform-integration/contracts/account/v1/README.md` 只指向并解释该唯一事实源，不复制第二份 schema，以避免合同漂移。

## 5. 双入口模型

### 5.1 AI 入口

`platform-integration/AGENTS.md` 是 Agent 的第一入口，并强制按以下顺序执行：

1. 读取 `manifest.json`。
2. 固定 Account API contract version。
3. 选择目标平台需要的 capability。
4. 配置环境与 Platform Key。
5. 实现平台自有 Auth/BFF。
6. 接入 Principal / Activation / Authorization。
7. 接入目标业务需要的可选能力。
8. 运行 conformance。
9. 输出接入证据与未完成项。

`ai/capabilities.json` 只建立 capability 与 OpenAPI `operationId`、指南、验证入口之间的映射，不复制 request/response schema。

### 5.2 Developer 入口

`platform-integration/README.md` 是人工开发入口，解释系统边界、最小接入闭环、环境变量、安全规则、按需 capability 和 Conformance。详细主题拆分到 `guides/`。

## 6. Canonical Contract 原则

公共 HTTP 合同唯一事实源继续是 `contracts/account/v1/openapi.json`。`platform-integration/` 内只保存版本指针、capability 索引、开发指南、示例和 conformance 使用说明，不保存第二套手写 API schema。

## 7. Capability 模型

Core：`auth-session`、`account-principal`、`account-activation`、`authorization-entitlement`、`errors-observability`。

Optional：`profile-preferences`、`config`、`config-gallery`、`feedback`、`commerce`、`lifecycle`。

每个 capability 至少描述 `id`、`required`、`operation_ids`、`guide`、`conformance_profile`、`notes`。

## 8. Conformance 边界

现有 `tests/consumer-harness` 继续作为可执行 fixture 的代码来源，但对外概念统一改成 `platform-integration/conformance`。首阶段不强制物理移动 Harness 代码，以减少测试脚本与 gate 的无价值 churn；稳定入口引用实际 Harness，并把 profile、命令和 PASS 语义写清楚。

Conformance 证明目标平台实现满足 Consumer HTTP 边界，不证明生产 Secret 已部署、生产环境已授权、商业配置已完成或发布 gate 已批准。

## 9. Admin 边界

删除 `/admin/consumer-lab` 及其导航、页面、生成 snapshot 和 Registry 暴露。

Admin 继续保留平台接入配置页，用于管理 Platform 状态、Origin/callbacks、Platform Key、deployment confirmation 与可选商业配置。Admin 不显示 Consumer Lab，也不提供目标仓库 Auth/BFF/E2E 的手工完成开关。

## 10. 平台运行时集成边界

目标平台继续使用 platform-owned Auth/BFF：Browser → same-origin BFF → AisenHub Account API。浏览器不得获得 Platform Key、Access/Refresh token、SQL 凭据、Storage Secret、Provider/Webhook Secret。

## 11. Registry 目标

`registry/manifest.json` 移除 `admin_consumer_lab` 与 `consumer_lab` 路径，改为暴露稳定的 `platform-integration` 入口。Harness 仍可作为 verification implementation 被 registry 引用，但不再作为 Admin 产品面概念。

## 12. 验收标准

1. Admin 中不存在 Consumer Lab 页面与导航。
2. 新平台开发者只从 `platform-integration/README.md` 即可找到完整接入路径。
3. AI Agent 只从 `platform-integration/AGENTS.md` + machine-readable manifest/capabilities 即可定位合同、能力、规则和验证命令。
4. OpenAPI 仍是 API schema 唯一事实源，且 contract check 无漂移。
5. Harness 仍可执行，现有 conformance 行为不被弱化。
6. Registry、文档索引、Admin Design 与架构文档不再引用 Consumer Lab 作为当前产品能力。
7. 不修改账户、Principal、Config、Feedback、Commerce 等领域模型。

## 13. 风险等级

**R3**。原因：此次变更会调整 Consumer 公共接入入口、Admin 路由、Registry、conformance 文档与 contract 周边工具链。虽然不修改业务领域 SQL，但必须确保公共合同、Harness、Admin 构建和接入指南同步一致。
