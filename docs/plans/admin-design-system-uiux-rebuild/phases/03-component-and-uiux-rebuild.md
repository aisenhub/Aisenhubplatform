# 阶段 03：组件与 UI/UX 并行全面重构

状态：未开始

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## Requirements

本阶段实际实施并验证 `REQ-ADM-002`、`REQ-ADM-003`、`REQ-ADM-004`、`REQ-ADM-005`、`REQ-ADM-007`、`REQ-ADM-008`、`REQ-ADM-009`。若某 Feature 涉及其他 Domain Requirement，执行批次时必须补读并加入该批次验收。

## 阶段目标

把阶段 01/02 冻结的 Design System 与 Aisenhub Design Direction 落入真实代码。组件优化和视觉/交互优化作为两条并行轨道，在同一真实页面批次内汇合；逐批覆盖全部 Admin 路由，而不是分别建设一套“未来组件库”和一套“临时页面皮肤”。

## 进入条件

- 阶段 01、02 均已交付。
- 新 `apps/admin/DESIGN.md` 已冻结。
- 当前路由、Feature、shared component、CSS ownership 和浏览器测试入口重新 inventory。
- 根据候选完整差异按 release workflow 重新确认风险级别；默认至少 R2。

## 目标实现职责

- shared semantic theme / component skin 进入 `packages/ui` 的稳定样式层，具体路径以当前 package export/build 约束确定。
- `packages/ui/src/shadcn/**` 保留结构/交互/API，逐步减少与 shared skin 重复的视觉所有权。
- `packages/ui/src/makerkit/**` 或后续等价目录保留稳定 semantic UI；目录历史命名不影响职责。
- `apps/admin/app/globals.css` 收敛为 assembly/reset/Admin adaptation/page geometry，不再大面积覆盖共享控件 slot。
- `apps/admin/features/**` 保留业务、数据、task flow、外部 layout 和真正局部差异，不重复基础 skin。

## 页面批次工作法

每个批次固定执行以下顺序：

1. 读取该 Feature 的真实数据/安全/路由/状态模型和适用 Requirement。
2. 列出 raw controls、自绘 skin、shared primitive、semantic component 和 CSS ownership。
3. 判断缺口应属于已有 component prop、共享有限 variant、product adaptation 还是局部实现。
4. 先修改/补齐共享能力，再让 Feature 消费；禁止先用 Feature override 赶页面效果。
5. 同步优化信息 hierarchy、spacing/density、responsive、visual states、copy hierarchy 和交互反馈。
6. 验证 keyboard/focus、screen width、loading/empty/error/refresh error、selected、disabled、danger、unknown outcome 等适用状态。
7. 删除该批次被替代的旧 CSS/自绘实现，确认没有两套同时生效。
8. 小提交、记录验证，再进入下一批。

## 首批 Pilot

建议先以 Shell / Navigation / PlatformSwitcher / Topbar 为 pilot，因为它们覆盖 Global/Platform scope、responsive、浮层、搜索、键盘、状态和高频 shared primitives。PlatformSwitcher 的服务端搜索、游标分页、Abort/stale-request 防护、route mapping 等业务行为保持 Feature 所有；触发 Button、Input、Popover/Listbox、状态和 Loading/Error 外观应优先复用标准能力。

## Shared Component 优先清单

按实际引用量和页面批次推进，优先审查 Button、Input、Textarea、Label、Select、Checkbox、Switch、Table、Card、Alert、Badge、Dialog、Sheet、Popover、Dropdown、Tooltip、Tabs，以及 AsyncState、StatusBadge、ResourceId、SupportErrorId、ConfirmActionDialog、MutationState、ResourceInspector、OneTimeSecretPanel 等 semantic UI。

不要求这些组件一次性全部重写；只要一个页面批次使用它，就必须先确定该组件在新 Design System 下的 owner、variant/state 和视觉来源。

## 变更范围

主要涉及 `packages/ui/**`、`apps/admin/app/**`、`apps/admin/components/**`、`apps/admin/features/**`、Admin unit/browser/E2E。原则上不改变 API、数据库或领域写入；若发现 UI 无法在不改变业务合同的情况下满足 Requirement，应停止该子项并拆出新计划/任务。

## 验证方案

每个页面批次至少选择与改动匹配的检查；阶段最终候选必须重新执行完整适用集。

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| 格式 | `pnpm format:check` | Local | PASS | 未运行 |
| Lint | `pnpm lint` | Local | PASS | 未运行 |
| TypeScript | `pnpm typecheck` | Local | PASS | 未运行 |
| Production build | `pnpm build` | Local | PASS | 未运行 |
| Unit | `pnpm test:unit` | Local | 受影响 shared/Admin tests PASS | 未运行 |
| Admin browser/E2E | `pnpm test:e2e:t12-r2` 或执行时确认的当前 Admin E2E 入口 | Local + Local Supabase | 受影响页面真实路径 PASS | 未运行 |
| 文档 | `pnpm docs:check`、`pnpm contracts:check` | Local | PASS | 未运行 |
| 浏览器人工矩阵 | 当前支持 desktop/narrow viewport + keyboard | Local | 页面可完成任务，无遮挡/焦点丢失/状态混淆 | 未运行 |

任何组件替换都必须验证原有 submit、focus restoration、Escape、Arrow key、controlled state、route mapping 和 dangerous-action confirmation 等真实行为，不允许用“视觉一致”代替行为验收。

## 退出与恢复条件

阶段 03 只有在全部 Admin 路由已经被明确归入并完成某个批次、shared ownership 已实际落地、批次测试和最终 R2 本地验证通过后才能退出。任何未覆盖路由必须列为剩余工作，不能用“主要页面已完成”代表全量完成。

回退以批次小提交为单位；出现 shared component 回归时优先修复或回退 shared 层，禁止在多个 Feature 上增加临时补丁长期共存。

## 文档与交付

- [ ] 每批次记录涉及路由、shared component、visual/UX 改动和验证。
- [ ] 当新结构成为真实运行路径后同步 `docs/architecture/modules/frontends.md`。
- [ ] `apps/admin/DESIGN.md` 只在设计决定真的改变时更新，不记录实现流水。
- [ ] `verification-record.md` 记录真实命令、失败、复测、commit/push。
