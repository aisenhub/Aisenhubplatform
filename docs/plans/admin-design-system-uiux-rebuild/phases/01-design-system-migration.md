# 阶段 01：迁移通用 Design System

状态：未开始

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## Requirements

本阶段是 UI/UX 基础治理准备，直接支撑 `REQ-ADM-003`、`REQ-ADM-007`、`REQ-ADM-008`，并为 `REQ-ADM-002/004/005/009` 的一致表达建立规则。它不单独关闭任何 Requirement Acceptance。

## 阶段目标

完整盘点参考项目的 Design System 文档，把其中与产品无关的通用设计原则、组件治理、状态/可访问性规则、页面组合边界和验证方法迁移到 Aisenhub 的长期文档层；同时冻结 Aisenhub 的 UI ownership contract，为阶段 02/03 提供唯一设计治理来源。

## 进入条件

- 本 Plan 已被接受为当前 UI/UX 总计划。
- 旧 `apps/admin/DESIGN.md` 已退出当前设计来源。
- 实施 Agent 可读取参考项目完整 `development/design/**`，并重新核对其当前版本，不仅依赖本 Plan 摘要。

## 必读资料

- 本 Plan 的 `design.md` / `plan.md`。
- `docs/spec/admin-console.md`、`apps/admin/PRODUCT.md`。
- `docs/architecture/modules/frontends.md`、`docs/review/admin-frontend-architecture-audit-2026-10-15.md`。
- 参考项目 `development/design/**` 全目录。
- 参考项目 `plans/2026-10-13_frontend_design_system/DESIGN_DIRECTION.md`、`IMPLEMENTATION_PLAN.md`、`architecture/PROJECT_ARCHITECTURE.md`。

## 变更范围

主要新增 `docs/development/design/**`，并同步 `docs/development/README.md` 等导航。此阶段原则上不修改 `packages/ui` 或 `apps/admin` 运行代码。

## 任务清单

- [ ] 建立参考 Design System 全量 inventory，标记每份文件为通用治理、产品适配或历史实施资料。
- [ ] 迁移 foundations contract：语义 token、theme、density、shape、surface、motion、layer、设计值单一来源等规则。
- [ ] 迁移 component contract：标准组件定义、结构/行为与 skin 分层、有限 variant、真实 state、复用/扩展/自写决策顺序。
- [ ] 迁移 controls/patterns：标准控件、页面组合、表单/表格/浮层/状态/导航等可复用模式；参考项目特有产品行为必须剔除或改写。
- [ ] 建立 Aisenhub ownership contract：Theme → Skin → Standard Component → Semantic UI → Feature/Page。
- [ ] 定义 `className`、Tailwind、raw native control、局部视觉例外和 product adaptation 的使用边界。
- [ ] 定义设计审查与验证规则，包括 keyboard/focus、reduced motion、非颜色状态、responsive、loading/empty/error/unknown outcome。
- [ ] 明确 `apps/admin/DESIGN.md` 在新体系中只承担 Product Adaptation，不能成为基础 Design System 的第二来源。
- [ ] 对照参考项目 inventory 检查是否遗漏通用设计方法；不能只迁移三四个已知文件就宣称完整迁移。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| 文档导航与链接 | `pnpm docs:check` | Local | PASS | 未运行 |
| 合同静态一致性 | `pnpm contracts:check` | Local | PASS；本阶段不改变 wire contract | 未运行 |
| Diff 格式 | `git diff --check` | Local | PASS | 未运行 |
| 迁移完整性审查 | 参考项目 `development/design/**` inventory 对照 | Local | 每项均有“迁移/产品专属不迁移/历史参考”结论 | 未运行 |
| 产品污染审查 | 人工对照参考项目产品适配 | Local | Aisenhub Design System 中无 AisenLens 专属色板、品牌或 workspace 皮肤 | 未运行 |

## 退出与恢复条件

只有 Design System 文档层已经完整、术语一致、导航可达并通过文档检查后，阶段 02 才能开始。若参考源版本不明确或存在互相冲突的合同，阶段状态设为已阻塞并记录来源，不得自行拼接两套规则。

## 文档与交付

- [ ] `docs/development/design/**` 已建立并成为长期通用设计治理源。
- [ ] 文档导航已同步。
- [ ] `verification-record.md` 已记录真实检查。
- [ ] 阶段 commit 已 push 且远端核对后，状态才可标记已交付。
