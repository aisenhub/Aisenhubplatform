# 阶段 05：Admin 安全全链路验收

状态：未开始

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

执行 `SEC-VERIFY-09`，对整个 R3 候选版本完成身份、MFA、权限、并发、失败恢复、审计、浏览器和迁移验收。本阶段只验证、记录和补充独立测试，不扩展产品范围。

## 进入条件

- `SEC-PROBE-00` 和 `SEC-ADMIN-01` 至 `SEC-WEB-08` 的必需门槛均已通过；身份、最后因子和审计关键风险不得以排除任务替代验证。
- 候选 commit、迁移集合、配置和测试版本已冻结。
- 本地 Supabase 和真实浏览器环境可用。
- 生产部署仍未自动授权。

## 任务清单

- [ ] 核对候选相对生产/当前 main 的完整差异。
- [ ] 执行未登录、普通用户、AAL1、AAL2、proof 有效/过期、session 撤销矩阵。
- [ ] 执行第一因子、第二因子、删除备用、拒绝最后因子、双击和双标签矩阵。
- [ ] 执行全部错误码、5xx、超时、响应丢失和重试矩阵。
- [ ] 证明 UI reason 到 audit、response request ID 到 audit。
- [ ] 证明 accepted、completed、failed 的状态和事件关联。
- [ ] 验证 migration 空库与旧数据升级、权限和 forward-fix。
- [ ] 验证桌面、窄屏、键盘、焦点、二维码降级和敏感信息遮挡。
- [ ] 验证候选环境响应头和 CSP。
- [ ] 使用合成数据演练离线恢复；真实管理员恢复不在范围。
- [ ] 同步 architecture、reference、operations 和验证记录。
- [ ] 检查敏感信息和本地测试残留。

## 验证命令

| 检查 | 命令 | 预期结果 | 实际结果 |
| --- | --- | --- | --- |
| 文档 | `pnpm docs:check` | PASS | 未运行 |
| 合同 | `pnpm contracts:check` | PASS | 未运行 |
| 格式 | `pnpm format:check` | PASS | 未运行 |
| 静态 | `pnpm lint` | PASS | 未运行 |
| 类型 | `pnpm typecheck` | PASS | 未运行 |
| 构建 | `pnpm build` | PASS | 未运行 |
| 单测 | `pnpm test:unit` | PASS | 未运行 |
| API 单测 | `pnpm exec deno test --allow-env supabase/functions/account-api/index.test.ts` | PASS | 未运行 |
| Supabase 环境准备 | `pnpm db:start`、`pnpm db:reset` | 仅证明本地环境可用；业务断言另列 | 未运行 |
| DB | `pnpm test:db` | PASS | 未运行 |
| API 实际 HTTP | 已实现并核实入口的 Admin 身份/Step-up 负例 | HTTP 结果及最终状态符合合同；`pnpm test:api` 不计实际 HTTP | 未运行 |
| Admin E2E | `pnpm test:e2e:t12-r2` | PASS | 未运行 |

验证命令以执行时仓库真实入口为准。命令不存在、环境不可用或断言未覆盖时写 NOT_RUN/PARTIAL/BLOCKED，不得伪造 PASS。

## 生产门槛

- 完整执行 G0–G5 和 Auth、权限、迁移、恢复领域门槛。
- 核对 main push 是否触发自动部署；未知时不得合并触发。
- 生产部署、真实 session 撤销、真实管理员恢复和强制 CSP 需单独授权。
- 发布后 G6 分别记录部署成功与观察完成；没有真实事件时不能用空日志代替业务验证。

## 退出与恢复条件

- 所有必需项有真实 PASS 证据；不可豁免的 R3 身份、权限、并发和恢复门槛不能以一般例外替代。
- 任何 Auth、权限、最后因子保护、审计关联或 migration 失败都阻止发布。
- 每阶段回退 commit 和 API/schema 兼容顺序已记录。
- 历史 audit 和 Auth factors 不通过代码回退删除。
- 最终报告使用项目流程模板并明确 commit、push、main、生产状态。
