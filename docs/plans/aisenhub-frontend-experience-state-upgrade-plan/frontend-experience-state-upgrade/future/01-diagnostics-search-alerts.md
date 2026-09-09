# Future — Diagnostics、Global Resource Search 与 Alerts

> 状态：**后续计划 / 本期暂不实施**  
> 本文件用于冻结未来 IA、依赖和启用条件，防止 Phase 01–08 为了“完整 Dashboard”提前造假功能。

## 1. 依赖前提

至少等待：

- Category 05 Observability 提供真实 metrics/health/log/query contract；
- Category 04 API Contract 提供受控 global search / diagnostics endpoint（若决定实施）；
- Operations backend 提供 unified feed/worker metrics（若决定实施）；
- 安全评审明确哪些 request/log metadata 可向 Admin 展示；
- 有实际数据 retention/time window/aggregation semantics。

任何前提未满足时，不上线绿色 health card、fake alert badge、fake search result。

## 2. System Health

目标问题：

> 系统现在是否正常？哪里异常？管理员下一步去哪里查？

规划：

```text
Overall Status
Services
  Auth
  Account API
  Database
  Storage
  Maintenance
Signals
  401/403/429/5xx
  error rate
  worker backlog
  oldest pending job
  last successful reconciliation
Recent Incidents
Links to Logs / Audit / Request Inspector
```

必须冻结的 backend contract：

- metric name/definition；
- time window；
- timestamp/staleness；
- service health source；
- partial data semantics；
- permission/redaction；
- error/unknown 状态。

Frontend 不能把 metrics fetch failure 映为 healthy。

## 3. Global Resource Search

未来实体：

```text
Platform
Account
User ID
Plan
Subscription
Redemption Batch
File
Operation
Request ID / Audit
```

要求：

- server-authorized search；
- explicit query limits；
- cross-platform scope；
- no existence leakage；
- result type + safe title/id/status；
- cursor/rank contract；
- no secret fields；
- request ID search与日志 retention一致。

现有 Command Palette 在 Phase 01只做 navigation/actions/recent routes；不要 client-side 拉全量资源假装 global search。

## 4. Alerts / Notification Center

只有后端有明确 alert lifecycle 才实施：

```text
open / acknowledged / resolved
severity
source
resource target
created/updated
request/incident correlation
```

不能用前端临时 error toast堆成“通知中心”。Unread badge必须来自真实状态。

## 5. Request Inspector

规划信息：

- request_id；
- route/operation；
- timestamp；
- outcome/status；
- actor/platform/target safe projection；
- correlated audit/log entries；
- dependency spans/trace **只有 observability实际支持时**。

禁止：

- raw authorization header；
- cookie/token/proof；
- file content；
- redemption/key plaintext；
- arbitrary SQL/API shell。

## 6. Operations 增强

Future backend可支持：

- unified operation feed；
- reconciliation/maintenance runs；
- failed scheduled tasks；
- retry history；
- worker metrics；
- incident correlation；
- domain-approved retry commands。

现有 Phase 06 deletion/file presentation不能被升级成未经 server contract的通用 retry engine。

## 7. 启动本 Future 的验证清单

在未来创建执行计划前重新核实：

1. 相关 OpenAPI/DTO；
2. Observability retention/metrics；
3. auth/admin permission；
4. privacy/redaction；
5. API rate/limit/cursor；
6. System Health staleness；
7. alert lifecycle；
8. request trace correlation；
9. staging test data；
10. browser/a11y/responsive。

没有这些事实前，本文件只作为页面规划，不算“功能已实现”。
