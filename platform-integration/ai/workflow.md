# AI Integration Workflow

## 1. Intake

记录：目标平台、仓库/commit、技术栈、中央 commit、Account contract major、Origin、首个 protected route、计划启用的 capabilities、当前授权范围。

## 2. Freeze Contract

读取：

- `contracts/account/v1/openapi.json`
- `contracts/account/v1/COMPATIBILITY.md`
- `contracts/account/v1/CHANGELOG.md`
- `platform-integration/ai/capabilities.json`

不要先实现手写 route table。

## 3. Central Readiness

确认中央 Admin 中当前平台至少具备：

- active + allow_activation；
- 当前环境完整 Origin/callback；
- active Platform Key；
- Key deployment confirmation。

这些条件只代表中央准备就绪。

## 4. Target Runtime

按顺序实现：

1. Auth adapter/session。
2. same-origin BFF security boundary。
3. `getPrincipal`。
4. `activateAccount`。
5. `getSubscription` / feature guard。
6. 一个真实 protected business route。
7. Optional capabilities。

## 5. Validate

中央仓库：

```powershell
pnpm platform-integration:check
pnpm contracts:check
pnpm test:consumer-harness
pnpm test:e2e:consumer-harness
```

目标仓库使用自己的 typecheck/build/unit/E2E。没有执行的环境明确写 `NOT_RUN` 或 `BLOCKED`，不要用另一仓库的 PASS 替代。

## 6. Deliver

最终报告模板：

```text
Target platform:
Target commit:
Central commit:
Account contract major:
Capabilities implemented:
Server-only config variable names:
Protected business route:
Target typecheck/build/unit/E2E:
Central conformance:
Local Supabase:
Production:
User TODOs:
Agent TODOs:
Upgrade notes:
Rollback notes:
```
