# OPT-001 平台切换器下拉浮层优化

状态：In Progress

关联：[总计划](plan.md) · [优化事项总清单](../optimization-intake/README.md)

## 背景与当前问题

`apps/admin/components/platform-context/platform-switcher.tsx` 同时承担 Global / Platform 工作区切换、平台名称/代码搜索和一个额外的“查看完整平台目录 →”跳转。当前下拉浮层固定 `w-72`，搜索框为 `h-8`，搜索区、全局选项、平台列表和底部目录入口在一个紧凑浮层里竞争视觉层级。

OPT-001 的用户目标是把这个组件收敛为纯粹的“范围切换器”：保留“所有平台（全局透镜）”、具体平台选择和平台搜索，移除底部平台目录跳转，并改善搜索框与浮层宽度、留白和控件高度的比例。

该组件同时用于 Admin Sidebar 的 Global / Platform 上下文，因此虽然不改业务数据，仍属于共享 UI 交互变更，按发布流程归类为 **R2**。删除目录按钮会改变一个点击入口，不能按纯视觉 R1 处理。

## 目标与范围

本次目标：

1. PlatformSwitcher 只承担 Global / Platform scope 切换，不再承担平台目录导航。
2. 搜索能力继续按平台名称和 code 本地过滤，不改变数据来源、请求数量或搜索语义。
3. 下拉浮层在桌面和窄屏保持可用宽度；搜索框不再显得过窄、过矮或与列表密度失衡。
4. 保留当前选中态、平台状态点、空搜索结果、加载失败/重试、点击外部关闭和 Escape 关闭行为。
5. `/admin/platforms` 页面与其他进入平台目录的真实导航入口继续存在，不因本组件移除目录快捷入口而删除路由。

明确排除：

- 不修改 `mapAdminScopeRoute`、Global / Platform 路由映射或 Sidebar 信息架构；这些属于后续 OPT-005 等事项。
- 不修改 Admin API、OpenAPI、数据库、Supabase、平台列表读取上限或服务端筛选。
- 不增加新的目录按钮、快捷键或第二套切换逻辑。

## 当前架构

PlatformSwitcher 在挂载时通过 Admin 同源会话请求 `/api/v1/admin/api/v1/platforms?limit=100`，并在浏览器内对已加载平台按 `name + code` 过滤。选择 Global 或具体平台后，由 `mapAdminScopeRoute(pathname, targetId)` 映射到等价 Global / Platform 资源路由。

当前浮层顺序为：

```text
切换工作区
→ 所有平台（全局透镜）
→ 搜索框
→ 已加载平台列表
→ 查看完整平台目录 →
```

底部目录入口直接 `router.push('/admin/platforms')`，与 scope switcher 的职责不同。

## 目标架构

组件职责收敛为：

```text
PlatformSwitcher
  ├─ 当前 scope 触发器
  └─ Dropdown
      ├─ “所有平台（全局透镜）”
      ├─ 平台搜索
      └─ 平台选项列表
```

视觉和布局决策：

- 浮层从 `w-72` 调整为 `w-80`，同时加 `max-w-[calc(100vw-2rem)]`，避免窄视口溢出。
- 浮层内部 padding 从单一 `p-1` 调整到更均衡的 `p-1.5`。
- 搜索区保持紧凑，但输入高度提升到 `h-9`，左右 padding 与搜索图标重新居中，形成与 20rem 浮层更协调的比例。
- Global 选项和平台列表继续使用紧凑行高，不把切换器变成大型命令面板。
- 删除平台列表后的分隔线和“查看完整平台目录 →”按钮，并移除只为该按钮使用的 `Boxes` 图标 import。

这些修改只改变组件呈现和一个冗余导航入口，不改变 scope 映射、数据读取或权限边界。

## 接口、数据与配置

无 API、DTO、数据库、Supabase、配置或 Consumer 合同变化。

受影响消费者只有 `apps/admin` 内使用 PlatformSwitcher 的 Admin Shell / Sidebar。`/admin/platforms` 路由本身不变。

## 风险与取舍

- **共享组件回归**：同一组件同时用于 Global 和 Platform 上下文；需要在至少两种 scope 下验证触发器、搜索和选中态。
- **窄屏溢出**：固定加宽如果没有 viewport 限制会超出移动屏，因此同时使用 viewport max-width。
- **入口移除误伤**：只删除 switcher 内的目录快捷入口，不删除平台目录页面或其他导航。
- **无后端风险**：没有 SQL/API/Storage/Auth/Supabase 变更，不需要远端 Supabase 部署；最终只需核对本 OPT 没有产生 Supabase 差异。

## 验收条件

1. 下拉浮层不存在“查看完整平台目录 →”按钮和对应 `router.push('/admin/platforms')` 逻辑。
2. Global 选项、平台列表、当前选中态和名称/code 搜索保持可用。
3. 搜索输入和浮层宽度按目标样式落地，并在 390px 级窄屏不横向溢出视口。
4. 点击外部和 Escape 仍关闭浮层并清空 query；空搜索结果和加载失败重试仍可用。
5. Admin typecheck、unit test、build、文档检查和针对 PlatformSwitcher 的本地浏览器回归通过。
6. 最终 diff 不包含 API、数据库、Supabase 或其他后续 OPT 的提前实现。

## 待确认项

无。OPT-001 的产品要求和实现边界已足够明确，可以进入计划与实施。
