# 阶段 02：审计关联与操作事实

状态：未开始

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

让操作员看到的 request ID、服务日志和数据库审计可关联，并确保确认框展示与操作原因都对应真实后端事实。阶段内按 `SEC-TRACE-03`、`SEC-ACTION-04` 顺序执行。

## 进入条件

- `SEC-TRACE-03` 可独立于阶段 01 开始；`SEC-ACTION-04` 仍要求规范 request ID 已进入审计上下文。
- `SEC-ACTION-04` 开始前，规范 request ID 已能进入审计上下文。
- 已核对 Admin OpenAPI、BFF、Account API、Admin/文件 dispatch、审计迁移和所有确认框调用方。

## 已核实调用链

- BFF request ID：`apps/admin/app/api/v1/[...path]/route.ts`
- UI 错误读取：`apps/admin/features/resources/admin-resource-utils.ts`
- API response/context：`supabase/functions/account-api/index.ts`、`admin.ts`
- 共享确认框：`packages/ui/src/makerkit/confirm-action-dialog.tsx`
- 文件和账户页面：`apps/admin/features/files/`、`apps/admin/features/accounts/`
- 账户生命周期与审计 SQL migration。

Agent 必须用 `rg` 重新枚举 `ConfirmActionDialog`、reason 字段、`audit_append` 和 request ID 生成点。

## 任务清单

### `SEC-TRACE-03`

- [ ] 中央 API 每次生成规范 request ID；浏览器提供的 ID 不能成为规范值。
- [ ] 明确区分 request ID 与 operation/idempotency ID。
- [ ] 将 ID 传入 Admin、文件和其他审计上下文。
- [ ] BFF 透传上游 ID；代理 ID 使用不同头名。
- [ ] 增加 HTTP mutation 到 audit 行的一致性测试；允许同一请求多行，异步最终事件通过 operation/job ID 关联。

### `SEC-ACTION-04`

- [ ] 清点共享确认框全部消费者。
- [ ] 删除默认的虚假异步/历史字段。
- [ ] 对每个 reason 输入决定使用服务端允许列表 `reason_code`、有明确需求的限长备注，或删除输入框。
- [ ] 需要保存的 reason 同步 DTO、OpenAPI、API、领域过程和最小投影；自由文本不声称自动脱敏。
- [ ] 明确同步结果、202 accepted、最终 completed/failed。

详细范围和验收以总计划对应任务卡为准。

## 不变量与失败恢复

- request ID 不接受未验证的任意长外部输入。
- 不将完整请求体或 Secret 写入 audit metadata。
- 原因的服务端校验不能只依赖前端 required。
- 已应用迁移只能 forward-fix。
- 异步请求响应丢失时不得自动重复执行非幂等动作。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| 合同 | `pnpm contracts:check` | Local | DTO/API/消费者一致 | 未运行 |
| DB | `pnpm test:db` | Local Supabase | 权限与审计过程通过 | 未运行 |
| API | Account API Deno tests | Local | ID、reason、202 分支通过 | 未运行 |
| Admin | `pnpm --filter admin test:unit` | Local | 确认框与错误显示通过 | 未运行 |
| 关联证据 | 实际 mutation 后按响应 ID 查询 audit | Local Supabase | 本次请求的审计行可关联；异步最终结果按 operation/job ID 关联 | 未运行 |
| 原因证据 | 文件/账户操作后查询 reason code | Local Supabase | 输入代码与允许列表投影一致 | 未运行 |
| 浏览器 | 同步/202/失败/重试 | Local browser | 文案与最终事实一致 | 未运行 |

## 退出与恢复条件

- 响应 ID 到审计行的真实证据为 PASS。
- 所有要求 reason 的 UI 均有后端证据；否则移除该字段。
- 所有确认框消费者已清点，无默认虚假陈述。
- 回退保持旧客户端兼容；历史审计不删除。
