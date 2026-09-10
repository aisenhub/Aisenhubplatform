# Phase 06 — Operations Center、Audit Inspector 与真实 Overview

> FE-R1（2026-09-10）：按当前代码基线 `main@c9c19f4` 维护；Auth 已实施，本期默认简体中文。Phase 06 本地代码批次已交付；本轮 T16-R2 已补 Operations 503/429 刷新失败保留已知任务与错误详情；全状态故障注入与阶段关闭条件以 `verification-record.md` 为准。

> 状态：**进行中**  
> 前置：Phase 01–05 中至少 Phase 04、05 已交付并 push；Operations 需要知道新资源 routes。  
> Phase 07 Consumer 可与本阶段并行继续。

## 1. 目标

把当前分散的异步/异常运维状态组织成真正的 Global Operations 能力，并完成 Audit/Overview 的产品化：

- `/admin/operations`：真实聚合 deletion jobs + files `deleting`/`write_outcome=unknown`；
- Operation detail/timeline：只使用真实 state/checkpoint；
- `/admin/audit`：在 Phase 01 严格状态基础上完善 Inspector/filter/request-id linking；
- Admin Overview：真实 attention/quick actions/recent activity，不做假图表；
- Resource Activity：只有 Audit API 能按 exact target filter 时实现；
- 旧 `/admin/deletion-jobs` 退出为 redirect/compat entry；
- 为未来 System Health/Diagnostics 留清晰导航边界，但不实现假状态。

## 1.1 当前实施（2026-09-10）

- `/admin/operations` 已接入真实有界 `deletion-jobs` 列表、详情、批准/启动和受控重试；状态展示只投影服务端 `state/checkpoint`，重试复用确认、近期 MFA、稳定幂等键和 unknown outcome 检查。
- 全局文件 attention 未伪造：当前 Admin config-files API 没有全局 `status` filter，因此 Operations 明确说明能力边界并链接到平台内 Files；不以一页文件结果冒充全局 deleting/unknown 统计。
- `/admin/audit` 保持 `q/limit/cursor` 真实过滤，在 Inspector 中仅为已确认存在的 platform、deletion job 路由提供目标跳转；request ID 仍是复制/查询入口，不伪造 Request Inspector。
- `/admin` 已改为真实 Overview，独立读取有界 platforms、deletion-jobs、audit 数据；局部刷新失败保留已知数据并标记失败，不生成 system health、趋势图或全局假计数。
- `/admin/deletion-jobs` 已退出为 `/admin/operations` redirect；导航、快捷入口和旧工程里程碑文案已收口。

验证与未完成项以 [verification-record.md](verification-record.md) 的 Phase 06 / VR-0007 为准；390px、完整键盘/焦点矩阵及全状态故障注入仍留最终收口阶段。

## 2. 必读

- Phase 01/04/05 + record
- `docs/operations.md`
- `docs/development/m6-operations-protocol.md`（只读业务/运维状态，不扩大后端范围）
- `docs/api-sdk.md`
- 当前 deletion-jobs page/API
- 新 Files routes/API capability
- Audit endpoint/OpenAPI actual filters
- current Admin home

## 3. Operations 第一版数据源冻结

只允许：

### A. Deletion Jobs

真实 fields 当前已核实：

```text
job_id
request_id
state
checkpoint
retry_count
last_error_code
```

### B. File Attention

从实际 Admin config-files list 中筛选：

```text
status=deleting
OR write_outcome=unknown
```

**前提：必须用 bounded/server query 能安全获得所需数据。** 如果 endpoint 不能按状态 server filter，不能无界拉取所有文件跨平台做“全局 Operations”。可退化为：

- deletion jobs 作为 global Operations；
- file attention 只在 Platform scope 或 Overview 链接展示；
- 把统一 file feed 标记为 backend dependency。

执行 agent 必须在 record 写明实际能力选择。

## 4. Operations presentation model

前端可以统一 presentation，但不能创造新的业务 state：

```ts
type OperationPresentation = {
  source: 'deletion-job' | 'config-file';
  id: string;
  platformId?: string;
  targetId?: string;
  state: 'attention' | 'running' | 'completed' | 'blocked' | 'unknown';
  rawState: string;
  requestId?: string;
  createdAt?: string;
  updatedAt?: string;
};
```

实际字段根据 API 调整。该类型是 UI projection，不是新的 Domain model，也不能写回 server。

映射必须可追踪：

- deletion blocked/retry/running/completed → presentation；
- file deleting → running；
- file unknown outcome → unknown/attention；
- 不把任何未知 raw status 随意映射 success。

## 5. `/admin/operations`

结构：

```text
Operations Overview
  Needs attention
  Running
  Recently completed（只有数据源有时间/状态且 bounded）

Operation List
  Filters(source/state/platform if API supports)
  Table
  Detail Inspector/Timeline
```

### 列/详情

- operation/source type；
- target；
- Platform；
- state；
- created/updated；
- request ID；
- checkpoint/timeline；
- safe retry only when original domain endpoint explicitly permits。

### Retry

- Deletion job retry：现有 endpoint 只允许 blocked/retry + recent MFA，复用 Phase 03 confirm/step-up；
- File unknown 不提供“force retry upload”统一 action；链接 File Inspector，让 file workflow 决定；
- 不创建跨域 `retry(operation)` 假 API。

## 6. Deletion Job detail

从旧 page 迁移：

- blocked 原因；
- retry count；
- checkpoint；
- request ID；
- retry action；
- accepted/running/completed 文案；
- worker checkpoint 是 authoritative；
- “批准并启动 deletion request”如果仍属于当前真实 Admin 能力，可放 Operations primary action，使用 high-risk Dialog/recent MFA/idempotency intent；如果产品 IA 更适合 identity/account inspector，也可保留 deep-link，但只能一处真实 mutation UI。

## 7. Audit 完善

Phase 01 已完成基本五态和 inspector；本阶段：

- 根据实际 endpoint 支持增加 actor/platform/target/action/outcome/time filters；
- 只显示真正支持的 filter；
- request ID column/detail；
- safe metadata；
- click target 可以跳到实际 resource route；
- click request ID 的 full Request Inspector 仍是 future，当前可复制/作为 q filter only if endpoint支持；
- Audit 永远只读，不提供 delete/replay。

## 8. Resource Activity

目标是资源详情 Timeline，但实现门槛严格：

- 如果 Audit API 支持 exact `target_type + target_id`（或等价）server filter，允许在 Platform/Account/File/Key Inspector 显示 recent activity；
- 如果只有 broad `q`，不要 client-side 拉大页历史再“猜 target”；只显示 “Open Audit filtered” 若 q 能准确表达，否则仅入口规划。

Activity 是 Audit 的只读 projection，不复制历史业务数据。

## 9. Admin Overview

Route `/admin` 从工程 M2/M3/M4 panel 变为 control-plane overview。

### 可以真实展示

只在 API/data source可 bounded 查询时：

- disabled platforms attention list/count；
- suspended accounts（若有真实 global/filter endpoint；没有就不做 count）；
- deletion jobs blocked/retry/running；
- file unknown/deleting（能力满足才做）；
- recent admin audit failures/activity；
- key deployment pending/disabled/rotation attention（只基于真实 metadata）；
- Quick actions / recent routes。

### 不允许

- “system healthy”绿色大卡，无 health backend；
- random growth chart；
- 从 limit=100 的第一页冒充总量；
- 失败时继续显示 stale metric 不标过期；
- 无时间窗口的 “最近错误趋势”。

### Last-known metric

若 Overview 使用 last-known data，background refresh 失败必须显示 stale/warning，不把旧值冒充当前。

## 10. Admin Topbar operation indicator

可以显示：

- blocked/running count **只有 bounded真实 API 能提供准确语义时**；
- 否则只显示“Operations”入口，不放 fake badge。

Alerts center 属于 Future，不在这里扩成通知系统。

## 11. 文件职责建议

```text
apps/admin/app/admin/operations/page.tsx
apps/admin/features/operations/*
apps/admin/features/audit/*        # 扩展 Phase 01
apps/admin/features/overview/*
apps/admin/app/admin/page.tsx
```

如果 Phase 05/04 resource inspector activity slots已存在，通过 shared composition接入，不跨 owner 大改资源业务组件。

## 12. 旧路径退出

- `/admin/deletion-jobs` → `/admin/operations` 或具体 filter；
- 删除旧 deletion-jobs mutation UI；
- Admin home 的 M2/M3/M4 工程里程碑文案退出；
- `AdminNav` 若仍存在引用列入 Phase 08 hard fail；
- Operations 不成为第二套 Files/Delete domain implementation。

## 13. 状态/失败测试

### Operations

- deletion running/blocked/retry/completed；
- file deleting/unknown（若 capability支持）；
- one source 503 时另一 source data 保留 + partial degradation alert；
- true empty vs source error；
- retry confirm/MFA/double click；
- request ID；
- row inspector/timeline；
- no universal fake retry。

### Audit

- filters URL；
- exact target only when supported；
- error preserves last-known rows；
- permission/access；
- target link；
- request ID copy。

### Overview

- data source success；
- partial source failure；
- no fake count from partial page；
- no-data source omits widget；
- background refresh stale indicator；
- quick links/routes。

## 14. 验证命令

```bash
pnpm --filter admin typecheck
pnpm --filter admin build
pnpm format:check
pnpm lint
pnpm typecheck
pnpm contracts:check
```

Deletion/files/audit backend regressions按当前脚本选择：

```bash
pnpm test:api:m4-05-maintenance
pnpm test:api:m4-07-file-query-download
pnpm test:e2e:t12-r2
```

如果实际 Operations UI 依赖的 Audit/file filters 需要 API contract 扩展，这已接近 Category 04/05 边界：只能做完成本 UI 所必需、范围明确的小合同扩展，并同步 OpenAPI/tests；否则记录为 backend dependency，前端退化而不是扩大重构。

## 15. 完成门槛与 Git

- Operations 至少 deletion jobs 真实闭环；file attention是否全局接入有真实能力证据；
- Overview 没有 fake metric；
- Audit/resource activity按 endpoint事实；
- old deletion page退出；
- necessary browser/error/partial-degradation tests实际运行；
- `verification-record.md` 据实更新；
- `git diff --check` + diff review；
- commit，例如：`frontend(admin): phase 06 add operations and control-plane overview`；
- push + remote confirmation；
- 向 Phase 08交付 final Admin route map、legacy redirects、planned-only omissions。

## FE-R1 阶段补充：有界运维与中文诊断

- 第一版Operations明确以deletion jobs为主；文件attention仅在平台内有真实查询能力时展示或提供链接，不假装已交付全局文件feed。
- Audit当前仅q/limit/cursor，精确target Activity延后；有界列表标明查询范围，不计算全局完成/失败总数。
- 当前checkpoint可展示为检查点，不虚构完整历史timeline或时间；无后端健康源不显示绿色健康卡。
- 运维任务、审计记录、受理/处理中/结果未确认/已完成采用中文且区分含义，技术详情保留安全code/request ID。
- 验收FE-V11～13、FE-V16。
