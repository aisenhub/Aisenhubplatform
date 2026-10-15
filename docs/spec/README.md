# Aisenhubplatform 需求管理

`docs/spec` 是项目需求的权威管理层，回答 **为什么要做、系统必须满足什么、怎样才算满足**。它不描述具体 SQL、组件树或一次开发任务的执行步骤。

## 1. 文档层级

项目文档按以下链路建立可追踪关系：

```text
Requirement (spec)
  -> Architecture
  -> Design / Plan
  -> Implementation
  -> Verification / Review
```

职责严格区分：

- `spec`：需求、约束、验收条件；回答 WHAT / WHY。
- `architecture`：当前稳定实现与模块边界；回答 HOW THE SYSTEM WORKS NOW。
- `plans`：一次开发或优化的目标设计、实施步骤、迁移与回退；回答 HOW TO CHANGE。
- `review`：审查实现是否满足 Requirement 与 Architecture，并记录问题和结论。
- `development`：开发流程和工程操作指南；不作为业务需求来源。

当前仓库仍处于旧 `proposals/reviews/guides/reference` 向上述结构迁移的过渡阶段；迁移完成前不得为了目录统一而丢失信息。

## 2. Requirement ID

每条正式需求使用稳定 ID：

```text
REQ-<DOMAIN>-<NNN>
```

领域代码：

| Code | Domain |
| --- | --- |
| `SYS` | 跨模块系统约束与非功能要求 |
| `PLT` | 平台与租户 |
| `IAM` | 身份、安全、MFA |
| `ACC` | Platform Account / Profile / Account 360 |
| `COM` | 商业目录 |
| `BIL` | 支付、订单、结算、Provider |
| `ENT` | 权益、订阅投影、兑换 |
| `CFG` | Config / Storage / Gallery |
| `FBK` | Feedback / Support |
| `OPS` | Audit / Delete / Maintenance / Recovery |
| `ADM` | Admin 控制台 |
| `API` | Consumer Integration / HTTP Contract |

ID 一旦分配不得重新用于另一条需求。若需求含义发生实质变化，应创建新 ID，并由新需求声明 `Supersedes`。

## 3. Requirement 属性与成熟度

第一轮登记的每条 Requirement 至少包含：

- **Status**：`Active | Superseded | Retired`；表示需求本身是否仍有效。
- **Delivery**：`Planned | Partial | Implemented`；表示当前实现覆盖程度。
- **Priority**：`P0 | P1 | P2 | P3`。
- **Type**：`Functional | Security | Privacy | Reliability | UX | Performance | Compatibility | Constraint`。
- **Statement**：用“系统必须 / 不得”写可判断的需求。

在 Requirement 被用来**冻结设计、关闭计划或声明正式验收完成**之前，还必须补齐：

- **Acceptance**：该 Requirement 自己的可验证验收条件；
- **Source**：用户要求、产品背景、已接受决策或合同来源；
- **Architecture**：负责满足该需求的架构模块（可继承模块 spec 的默认架构映射）；
- **Verification**：测试、合同检查、人工审查或环境证据。

当前第一轮需求集是从现有产品目标、已接受决策、合同和已实现不变量反向提炼的 **baseline**。`Delivery=Implemented` 表示当前代码/合同观察上已经存在对应能力，不自动等于该 Requirement 已完成逐条正式验收；第二轮 parity 必须继续补 Source / Acceptance / Verification。新需求不得使用这个 baseline 例外，创建时应直接写完整。

需求不能只写实现方式。例如“使用 PostgreSQL 某张表”通常属于 Architecture；只有明确技术约束本身就是产品/组织要求时，才作为 `Constraint` 出现在 spec。

## 4. 变更规则

1. 新功能或优化在写设计/计划前先确认对应 Requirement ID；没有合适需求时先补 spec。
2. Architecture 新增或修改稳定能力时，必须列出覆盖的 Requirement ID。
3. Design/Plan 必须声明 `Requirements`，说明本次变更覆盖、影响或不影响哪些 Requirement。
4. Review 必须按 Requirement + Architecture 审查；不能只按“页面看起来正常”验收。
5. Requirement 被替代时不得静默改写旧 ID 的核心含义。
6. 已实现不等于需求不可变；需求被 Superseded 后，Architecture/Plan 必须迁移到新 Requirement。
7. 尚未接受的想法、可选功能、探索性建议不能伪装成 Active Requirement。

## 5. 当前需求集

第一轮先建立已能从当前产品目标、合同、架构和已实现不变量中确认的基线需求：

- [跨模块系统基线](system-baseline.md)
- [平台与租户](platform-tenancy.md)
- [身份与安全](identity-security.md)
- [Admin 控制台](admin-console.md)
- [账户与资料](accounts-profile.md)
- [商业目录](commerce-catalog.md)
- [支付与结算](billing-settlement.md)
- [权益、订阅投影与兑换](entitlements-redemption.md)
- [Config 与 Storage](config-storage.md)
- [Feedback 与支持](feedback-support.md)
- [审计、删除与维护任务](audit-lifecycle-operations.md)
- [Consumer 接入与 HTTP 合同](consumer-api-integration.md)

第一轮需求集覆盖当前模块地图；后续 parity 审查继续补充 Acceptance、Source、Verification 和尚未满足的 Delivery 状态，不能把“第一轮已建立”理解为需求已经完整冻结。

## 6. 模块需求提炼状态

| Domain | Target spec | Architecture | Status |
| --- | --- | --- | --- |
| System | `system-baseline.md` | 全局 | 第一轮已建立 |
| Platform | `platform-tenancy.md` | `architecture/modules/platform-tenancy.md` | 第一轮已建立 |
| Identity/Security | `identity-security.md` | `architecture/modules/identity-security.md` | 第一轮已建立 |
| Account | `accounts-profile.md` | `architecture/modules/accounts-profile.md` | 第一轮已建立 |
| Commerce | `commerce-catalog.md` | `architecture/modules/commerce-catalog.md` | 第一轮已建立 |
| Billing | `billing-settlement.md` | `architecture/modules/billing-settlement.md` | 第一轮已建立 |
| Entitlement | `entitlements-redemption.md` | `architecture/modules/entitlements-redemption.md` | 第一轮已建立 |
| Config/Storage | `config-storage.md` | `architecture/modules/config-storage.md` | 第一轮已建立 |
| Feedback | `feedback-support.md` | `architecture/modules/feedback-support.md` | 第一轮已建立 |
| Operations | `audit-lifecycle-operations.md` | `architecture/modules/audit-lifecycle-operations.md` | 第一轮已建立 |
| Admin | `admin-console.md` | `architecture/modules/admin-console.md` | 第一轮已建立 |
| Consumer/API | `consumer-api-integration.md` | `architecture/modules/consumer-api-integration.md` | 第一轮已建立 |

## 7. Traceability

项目级追踪表见 [traceability.md](traceability.md)。新需求必须能沿着 Requirement -> Architecture -> Plan/Design -> Verification 找到至少一条明确路径。

需求模板见 [_template.md](_template.md)。
