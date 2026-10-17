# 阶段 04：全站收敛与 UI 治理

状态：验收通过待推送（最终 clean R2 24/24 PASS）

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## Requirements

最终重新验证 `REQ-ADM-002`、`REQ-ADM-003`、`REQ-ADM-004`、`REQ-ADM-005`、`REQ-ADM-007`、`REQ-ADM-008`、`REQ-ADM-009`、`REQ-ADM-011`、`REQ-ADM-012` 的全部适用 Acceptance，并确保长期治理不会允许后续代码轻易绕过 Design System。

## 阶段目标

在全站 UI/UX 批次完成后删除遗留双轨实现，建立静态和文档治理门槛，完成全 Admin 路由、多 viewport、键盘/焦点和状态语义回归，使 Design System 成为后续开发的默认执行规则而不是一次性重构资料。

## 进入条件

- 阶段 03 所有 Admin 路由已覆盖并达到批次退出条件。
- shared Theme/Skin/Component ownership 已稳定，阶段 04 不再进行大规模视觉探索。
- 所有临时 compatibility/allowlist 都有明确 owner 和去留结论。

## 任务清单

- [x] 全仓搜索 Admin Feature 中 raw `<button>/<input>/<select>/<textarea>`、重复 base skin utility、旧 CSS selector 和已废弃 variant。
- [x] 全仓搜索普通 UI 的自绘/零散 SVG、PNG、emoji icon 与直接 icon path，迁移到标准图标库；只保留有记录的品牌/专业图形例外。
- [x] 建立静态治理规则：普通 Feature 新增 raw 基础控件或大量 background/text/border/radius/shadow/hover/focus skin 时给出警告/失败；对合理 native/business-content 场景提供精确显式 allowlist。
- [x] 清理 `globals.css` 中无消费者 legacy `.panel` 与旧 Sidebar visual owner，避免 Theme/Skin 两套来源。
- [x] 审查 shared component 的旧视觉 utility/variant；`transition-all` 命中均属于 Admin 当前未消费的共享/上游能力，本阶段不越界重写其他产品组件；Admin 已消费的 Button/Badge/Switch 等在 03B 已完成收敛。
- [x] 全面检查 `className` override，治理 gate 允许外部 layout utility，并拒绝标准控件静态内部 visual-skin override。
- [x] 统一 design review checklist，新增页面/组件必须先判断“复用 → 扩展 → 自写”，并记录在 Design System component contract。
- [x] 对全路由执行 responsive、keyboard/focus、ARIA、reduced motion、loading/empty/error/refresh error、danger/unknown outcome review。
- [x] 对全路由执行 Appearance matrix 与 perceived performance review，覆盖 Light/Dark/System、代表 Accent/Surface、首屏/导航/refresh/mutation 的稳定性与即时反馈。
- [x] 更新 Architecture 为实际最终结构；更新 Spec Domain Verification 和 Review 结论，删除只描述旧 UI ownership 的过时事实。
- [x] 检查 Plan 是否还有未实现目标；未完成项不能通过改文档措辞伪装完成。

## 静态治理原则

治理目标不是禁止原生 HTML 或 Tailwind，而是阻止基础 UI 重新失去所有权。至少覆盖：

- 普通 Feature 优先使用 `@kit/ui` standard component。
- raw control 需要明确合理场景，不能只是为了方便自绘按钮/输入。
- Feature layout utility 合法；大段基础控件视觉 utility 需要迁移到 standard variant/skin 或说明例外。
- `data-slot` / part / state attribute 作为 skin 连接结构的稳定接口时，需要有 contract，不能由页面随意覆盖。
- 新增共享 variant 必须是稳定、可复用语义，不把单页临时差异塞进 component API。
- 普通 UI icon 必须来自标准图标库和冻结的语义映射；Feature 自绘图标需要显式例外与 owner。
- Theme/Appearance 只能有一个运行 owner；Feature 不得增加局部主题状态、自由色板或只改变单页 primary 的伪主题。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| 文档 | `pnpm docs:check` | Local | PASS | PASS：115 documents；首次同步因 `icons.md` 相对链接错误 FAIL，修复后 PASS；最终 clean R2 再次 PASS |
| Contract | `pnpm contracts:check` | Local | PASS | PASS：Account 40 / Admin 78 operations；Platform integration / Consumer compatibility PASS |
| 格式 | `pnpm format:check` | Local | PASS | PASS：426 files；首次 checkpoint 仅 3 个本批文件有格式差异，定向修复后 PASS |
| Lint + 新 UI 治理规则 | `pnpm lint` / `pnpm admin-ui:check` | Local | PASS | PASS：0 warning/error；54 Feature / 130 Admin source；5 个显式 native/business-content 例外 |
| Typecheck | `pnpm typecheck` / `pnpm --filter admin typecheck` | Local | PASS | PASS：checkpoint 与最终 clean R2 均通过 |
| Build | `pnpm build` / `pnpm --filter admin build` | Local | PASS | PASS：Next.js production build 与仓库 build gate 通过 |
| Unit | `pnpm test:tooling` + `pnpm --filter admin test:unit` | Local | PASS | PASS：tooling 12/12；Admin 17 files / 77 tests；最终 clean R2 unit gate 通过 |
| Admin E2E | `pnpm test:e2e:t12-r2` via `pnpm run verify:task:0801` | Local + Local Supabase | PASS | PASS：第一次 clean R2 的 System media 断言因未等待异步 change event FAIL；改为等待真实 DOM theme 更新后第二次 clean R2 PASS |
| 全路由 UI review | route inventory × viewport × keyboard/state matrix | Local | 无遗漏路由和关键状态 | PASS：synthetic 60 route/viewport + 0 runtime exception；正式 T12 responsiveA11y 95 route checks；Appearance Accent/Surface/System/reduced-motion matrix PASS |
| Diff | `git diff --check` | Local | PASS | PASS |

最终候选如果仓库已有更高层且覆盖上述检查的 Local release gate，可按当前 release workflow 使用，但必须确认它确实覆盖当前 SHA；不能引用旧候选 PASS。

## 退出与恢复条件

只有静态治理已生效、旧双轨实现已清理、全量适用验证通过、Architecture/Spec 已同步且没有未记录的 UI route/state 缺口后，阶段 04 才能标记已交付。若治理规则误伤合理 native control，应修正规则或增加有理由的 allowlist，不应直接关闭门禁。

## 文档与交付

- [x] `docs/development/design/**` 反映最终长期治理。
- [x] `apps/admin/DESIGN.md` 反映最终 Product Adaptation。
- [x] `docs/architecture/modules/frontends.md` 描述真实 Theme/Skin/Component/Feature ownership。
- [x] `docs/spec/admin-console.md` Domain Verification 指向当前有效来源。
- [x] `verification-record.md` 完整记录最终 Requirement 验收；Git push/远端 SHA 在交付后补最后一笔记录。
- [x] Plan 已核对实现目标；过程文件继续作为真实执行历史，不承担 Architecture 权威。
