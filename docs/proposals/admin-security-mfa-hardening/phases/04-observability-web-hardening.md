# 阶段 04：审计可观测性与浏览器加固

状态：未开始

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

把前面已经可信的 request ID、原因、MFA 和结果投影为可调查审计，并为 Admin 浏览器增加经过验证的响应安全头。`SEC-AUDIT-07` 和 `SEC-WEB-08` 可独立派发，但默认串行；若明确并行，不能共享同一 Agent 工作区或同一文件。

## 进入条件

- `SEC-AUDIT-07` 要求 `SEC-ACTION-04` 与 `SEC-MFA-06` 已交付；`SEC-WEB-08` 可独立开始。
- 审计事件字段和 MFA 安全事件来源已稳定。
- 执行安全头任务前能够观察候选部署或等价反向代理响应；只有 dev server 时不能完成生产头部验收。

## 任务清单

### `SEC-AUDIT-07`

- [ ] 定义 accepted/completed/failed，不用空 metadata 推断失败。
- [ ] 投影允许列表内的 actor、target、reason、summary、request ID。
- [ ] 异步请求事件与最终事件可关联。
- [ ] 增加应用处理的 factor add/remove、Step-up、session revoke、admin recovery 安全事件；Auth 原生日志单独核对来源、启用状态和保留期。
- [ ] 验证普通用户无权读取 Admin audit。
- [ ] 更新 Audit、Overview、Security 页面，不展示伪造 outcome。

### `SEC-WEB-08`

- [ ] 读取实际部署层现有 headers，记录来源和冲突。
- [ ] 用 `X-Frame-Options: DENY` 或最小强制 `frame-ancestors 'none'` 建立真实 framing 防护；完整 CSP 先 Report-Only。
- [ ] 验证 frame、object、base、form、MIME、referrer、permissions、HSTS；没有报告接收端时只记录控制台和手工证据。
- [ ] 兼容 Next.js、Auth API、静态资源和 TOTP `data:` QR。
- [ ] 增加自动响应头断言和真实浏览器控制台检查。
- [ ] 强制 CSP 只作为单独生产授权步骤。

详细范围和验收以总计划对应任务卡为准。

## 安全与隐私约束

- audit DTO 使用允许列表，不直接返回完整 metadata。
- 不展示 Token、Cookie、MFA Secret、恢复材料或未脱敏个人数据。
- CSP 不以永久宽泛 `unsafe-*` 解决兼容问题。
- 不在应用和部署代理同时配置互相矛盾的策略。
- HSTS 只在确认全站 HTTPS 和域名策略后启用。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| DB/audit | `pnpm test:db` | Local Supabase | 权限与投影通过 | 未运行 |
| API/合同 | API Deno tests、`pnpm contracts:check` | Local | DTO 与事件通过 | 未运行 |
| Admin | Admin 单测与浏览器 Audit 查询 | Local | 结果和原因有用 | 未运行 |
| Headers | 自动响应头断言 | Candidate | 策略存在且不冲突 | 未运行 |
| CSP | 浏览器登录/MFA/API/QR | Candidate browser | 无未解释阻断 | 未运行 |
| 构建 | `pnpm build`、`pnpm typecheck` | Local | Admin 构建通过 | 未运行 |

## 退出与恢复条件

- 审计可以用 request ID重建一次变更，accepted 与最终结果不混淆。
- 普通用户无法读取 Admin 审计。
- framing 强制头生效且 Report-Only 兼容证据完成；未单独授权时不启用生产完整强制 CSP。
- 审计迁移只 forward-fix，不删除历史；安全头可通过明确配置提交快速回退。
