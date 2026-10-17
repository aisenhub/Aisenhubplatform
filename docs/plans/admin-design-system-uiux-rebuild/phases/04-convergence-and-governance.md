# 阶段 04：全站收敛与 UI 治理

状态：未开始

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

- [ ] 全仓搜索 Admin Feature 中 raw `<button>/<input>/<select>/<textarea>`、重复 base skin utility、旧 CSS selector 和已废弃 variant。
- [ ] 全仓搜索普通 UI 的自绘/零散 SVG、PNG、emoji icon 与直接 icon path，迁移到标准图标库；只保留有记录的品牌/专业图形例外。
- [ ] 建立静态治理规则：普通 Feature 新增 raw 基础控件或大量 background/text/border/radius/shadow/hover/focus skin 时给出警告/失败；对 file/color/range 等合理 native control 和特殊可视化提供显式 allowlist。
- [ ] 清理 `globals.css` 中已迁移到 shared skin 的 component slot 规则和无效 token，避免 Theme/Skin 两套来源。
- [ ] 清理 shared component 中与新 skin 重复的旧视觉 utility、无用 variant 和死 CSS；保留结构、语义和真实 state hook。
- [ ] 全面检查 `className` override，要求内部视觉差异优先使用有限 variant 或 product adaptation。
- [ ] 统一 design review checklist，新增页面/组件必须先判断“复用 → 扩展 → 自写”。
- [ ] 对全路由执行 responsive、keyboard/focus、ARIA、reduced motion、loading/empty/error/refresh error、danger/unknown outcome review。
- [ ] 对全路由执行 Appearance matrix 与 perceived performance review，覆盖 Light/Dark/System、代表 Accent/Surface、首屏/导航/refresh/mutation 的稳定性与即时反馈。
- [ ] 更新 Architecture 为实际最终结构；更新 Spec Domain Verification 和 Review 结论，删除只描述旧 UI ownership 的过时事实。
- [ ] 检查 Plan 是否还有未实现目标；未完成项不能通过改文档措辞伪装完成。

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
| 文档 | `pnpm docs:check` | Local | PASS | 未运行 |
| Contract | `pnpm contracts:check` | Local | PASS | 未运行 |
| 格式 | `pnpm format:check` | Local | PASS | 未运行 |
| Lint + 新 UI 治理规则 | `pnpm lint` 及实际新增检查入口 | Local | PASS | 未运行 |
| Typecheck | `pnpm typecheck` | Local | PASS | 未运行 |
| Build | `pnpm build` | Local | PASS | 未运行 |
| Unit | `pnpm test:unit` | Local | PASS | 未运行 |
| Admin E2E | `pnpm test:e2e:t12-r2` 或当前正式 Admin browser gate | Local + Local Supabase | PASS | 未运行 |
| 全路由 UI review | route inventory × viewport × keyboard/state matrix | Local | 无遗漏路由和关键状态 | 未运行 |
| Diff | `git diff --check` | Local | PASS | 未运行 |

最终候选如果仓库已有更高层且覆盖上述检查的 Local release gate，可按当前 release workflow 使用，但必须确认它确实覆盖当前 SHA；不能引用旧候选 PASS。

## 退出与恢复条件

只有静态治理已生效、旧双轨实现已清理、全量适用验证通过、Architecture/Spec 已同步且没有未记录的 UI route/state 缺口后，阶段 04 才能标记已交付。若治理规则误伤合理 native control，应修正规则或增加有理由的 allowlist，不应直接关闭门禁。

## 文档与交付

- [ ] `docs/development/design/**` 反映最终长期治理。
- [ ] `apps/admin/DESIGN.md` 反映最终 Product Adaptation。
- [ ] `docs/architecture/modules/frontends.md` 描述真实 Theme/Skin/Component/Feature ownership。
- [ ] `docs/spec/admin-console.md` Domain Verification 指向当前有效来源。
- [ ] `verification-record.md` 完整记录最终 Requirement 验收和 Git 交付。
- [ ] Plan 满足完成条件后按文档治理规则决定过程文件清理，不把历史执行资料长期冒充架构。
