# 组件准入与复用契约

## 1. 什么是标准组件

一个组件成为标准能力，至少需要：

- 清楚的用途、适用和不适用场景；
- 稳定、有限且真实使用的 API；
- 正确 DOM/ARIA、键盘、焦点和输入模型；
- 接入共同 Theme / Skin / 状态表达；
- 正常、disabled、invalid、selected/open/busy 等适用状态的行为验证；
- 没有产品业务、权限、存储或数据请求依赖。

“位于 `packages/ui`”“是 shadcn 文件”“来自 Base UI”“加了 `// standard` 标记”都不能单独证明以上条件。

## 2. 复用顺序

业务开发按以下顺序：

1. 查现有标准组件；
2. 查现有 props、semantic variant、size 和 composition；
3. 若存在稳定通用缺口，最小扩展当前成熟系统；
4. 只有现有系统不能合理表达且确有任务需要时，才自写缺失交互，并仍复用基础控件、Theme 和状态规则。

不要因为视觉差一点就复制一个新的 Button；不要因为组件名字含“Platform/Account/Billing”就把基础控件重新实现一遍。

## 3. 业务边界

以下内容留在 Feature/领域层：权限、MFA、数据读取/提交、If-Match、operation_id、路由、平台作用域、任务状态机、领域错误分类、业务确认文案、持久化和恢复规则。

共享 UI 可以接收这些状态并呈现，但不能自行推断或修改它们。例如 `ConfirmActionDialog` 可以呈现 target/reason/confirm，不应该决定哪个 API 需要 recent MFA。

## 4. 替换自写控件

将 Feature 中的 raw button/menu/listbox 等替换为标准能力时，先列出并保留：

- role/accessible name；
- 当前值/选择/open state；
- 键盘模型；
- focus enter/return；
- Escape/cancel/outside press；
- submit 行为；
- 路由、搜索、分页和 stale-request 防护；
- loading/error/empty/unknown 等真实状态。

标准化不能以“外观一致”为理由丢掉成熟业务行为。

## 5. 原生元素

原生元素按语义使用是合法实现。文件、颜色、range 等特殊输入，或简单 `<table>`/`<button>` 在确有需要时可以保留；关键是是否已有更合适的标准能力、是否接入共同外观和可达性规则，而不是静态扫描到标签就判错。

## 6. 静态治理与例外

产品可以用静态检查保护已经完成的 ownership 收敛，但检查必须遵守同一组件合同：

1. 先判断 **复用 → 扩展 → 自写**，不能因为 gate 存在就把业务组件强行塞进基础控件 API。
2. Feature raw 基础控件、第二 Theme owner、直接 component-skin helper、标准控件内部视觉 override 等高置信度漂移可以直接失败。
3. 业务集合行 trigger、业务图片、特殊 native input 或专业图形等合理例外必须按精确文件/语义记录理由；不能用目录级或通配 allowlist 掩盖新违规。
4. 例外失去真实消费者后应使 gate 或审查暴露 stale allowlist，并删除例外，而不是永久保留。
5. Tailwind layout utility 仍然合法；静态治理不能把外部 grid/flex/gap/width/responsive geometry 误判为第二 component skin。

Aisenhub Admin 当前通过根 `pnpm admin-ui:check` 实施以上规则，并将它串入 `pnpm lint` / Local release gate。

## 7. 跨产品/跨项目复用

若未来出现第二个真实消费者，完整复用包应同时包含：Theme/Skin、组件源码与状态行为、必要依赖/资源/许可、接入说明、匹配规范和验证。只复制 Markdown、只复制 CSS 或只复制 TSX 都不能保证完整效果。
