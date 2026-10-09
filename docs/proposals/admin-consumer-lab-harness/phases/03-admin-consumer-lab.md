# Phase 03：Admin Consumer Lab

状态：已交付

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

在现有 Admin Global 工作区新增 `/admin/consumer-lab`，把维护者查看公共合同、Harness 用法和接入边界的 UI 收敛到 Admin，而不把 Admin 变成外部 Consumer 实现。

## 进入条件

- Phase 01 已交付。
- 不要求 Phase 02 完成，但页面不得写成 Harness 已经 PASS；只有路径/命令在代码存在后才能显示为可用。

## 修改文件

- `apps/admin/components/navigation/admin-navigation.ts`
- `apps/admin/app/admin/consumer-lab/page.tsx`
- `apps/admin/features/consumer-lab/consumer-lab-page.tsx`
- 相关 Admin unit test。

## 页面内容

1. Header：Consumer Lab，明确“维护/诊断，不是生产 Consumer”。
2. Contract cards：Account/Admin major、`info.version`、operation 数量、security scheme 名称。
3. Account operation table：method/path/operationId/security；从 canonical JSON build-time import 生成，不复制手写路由表。
4. Harness card：路径与已存在的 Local 命令，强调 Local-only。
5. Security checklist：Platform Key server-only、Bearer HttpOnly、Origin/CSRF、no-store/request_id、fail closed。
6. 不展示 Secret 值、不允许在浏览器填写 Platform Key、不提供任意 URL proxy、不提供直接 SQL/Storage 操作。

## 交互与可访问性

- Global Sidebar 增加 Consumer Lab；Platform workspace 下通过 Global utility 仍可到达。
- operation table 在窄屏可水平滚动且有可访问名称；没有 fake loading/progress。
- 页面完全可读时不依赖网络请求；contract import/build 失败应让 build 失败，而不是运行时展示“未知但成功”。

## 验证

```text
pnpm --filter admin test:unit
pnpm --filter admin typecheck
pnpm --filter admin build
pnpm lint
git diff --check
```

浏览器定向：登录 AAL2 Admin 后打开 `/admin/consumer-lab`，确认导航 active、contract operation 表存在、320/375/768/1440 宽度无不可用页面溢出、键盘可到主要链接/表格容器。

## 退出条件

- Admin Lab 页面真实存在并可导航。
- 页面只展示 canonical contract/静态边界，不使用 Admin private API 模拟 Consumer 成功。
- Phase 04 可在删除旧 Reference Consumer 后保留维护者 UI。
