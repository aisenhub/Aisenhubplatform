# 阶段 01：迁移通用 Design System

状态：已交付

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

- [x] 建立参考 Design System 全量 inventory，标记每份文件为通用治理、产品适配或历史实施资料。
- [x] 迁移 foundations contract：语义 token、theme、density、shape、surface、motion、layer、设计值单一来源等规则。
- [x] 迁移 component contract：标准组件定义、结构/行为与 skin 分层、有限 variant、真实 state、复用/扩展/自写决策顺序。
- [x] 迁移 controls/patterns：标准控件、页面组合、表单/表格/浮层/状态/导航等可复用模式；参考项目特有产品行为必须剔除或改写。
- [x] 建立 Aisenhub ownership contract：Theme → Skin → Standard Component → Semantic UI → Feature/Page。
- [x] 定义 `className`、Tailwind、raw native control、局部视觉例外和 product adaptation 的使用边界。
- [x] 定义设计审查与验证规则，包括 keyboard/focus、reduced motion、非颜色状态、responsive、loading/empty/error/unknown outcome。
- [x] 明确 `apps/admin/DESIGN.md` 在新体系中只承担 Product Adaptation，不能成为基础 Design System 的第二来源。
- [x] 对照参考项目 inventory 检查是否遗漏通用设计方法；不能只迁移三四个已知文件就宣称完整迁移。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| 文档导航与链接 | `pnpm docs:check` | Local | PASS | 首次 FAIL：遗漏规则说明素材导航；补链后复测 PASS，115 documents |
| 合同静态一致性 | `pnpm contracts:check` | Local | PASS；本阶段不改变 wire contract | PASS |
| Diff 格式 | `git diff --check` | Local | PASS | PASS |
| 迁移完整性审查 | 参考项目 `development/design/**` inventory 对照 | Local | 每项均有“迁移/产品专属不迁移/历史参考”结论 | PASS：56 个 tracked 文件，11 foundations / 6 components / 8 patterns / 16 rules / 14 products / 1 root 均有处理结论 |
| 产品污染审查 | 规则计数 + 产品特定值扫描 | Local | 62 条通用规则完整；通用正文无 AisenLens 专属字体、色板、形状或 motion 值 | PASS：62/62；产品特定值扫描 0 命中（迁移清单中的历史说明除外） |

## 退出与恢复条件

只有 Design System 文档层已经完整、术语一致、导航可达并通过文档检查后，阶段 02 才能开始。若参考源版本不明确或存在互相冲突的合同，阶段状态设为已阻塞并记录来源，不得自行拼接两套规则。

## 文档与交付

- [x] `docs/development/design/**` 已建立并成为长期通用设计治理源。
- [x] 文档导航已同步。
- [x] `verification-record.md` 已记录真实检查。
- [x] 阶段 commit `647bc365e3647e2d61b0aa2e345b29eb9fc7797d` 已 push 到 `origin/codex/admin-design-system-phase1`，远端 SHA 已核对一致。
