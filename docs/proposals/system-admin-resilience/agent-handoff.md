# System Admin 多管理员与灾备韧性实施交接

状态：Completed（2026-10-14）

## 执行入口

后续维护或扩展前依次阅读：

1. `AGENTS.md`
2. `docs/guides/development-release-workflow.md`
3. 本目录 `design.md`、`plan.md`、阶段文件与 `verification-record.md`
4. `docs/architecture/modules/identity-security.md`
5. `docs/reference/data-model.md`
6. `docs/guides/operations.md`
7. 实际 migration、Account/Admin API、Admin Security/MFA UI 和测试 fixture

## 已冻结的当前架构

- 多管理员是同一 System Admin 权限级别，不做 RBAC。
- 正常运行至少 2 个 active System Admin。
- 新管理员先 pending，双 verified TOTP 后 active。
- online add/activate/remove 要求 active actor、AAL2、recent MFA 和 audit。
- 最少 active 数量算法只在 private domain function 中实现，并发下也成立。
- System Admin 使用专用 Auth identity，不把普通 Consumer 账号直接晋升。
- Production 日常变更不依赖手工 SQL；首次 bootstrap/全部失联使用受控 offline recovery。
- 不存在网页 MFA 绕过入口或隐藏常驻 recovery admin。

## 完成证据

实施与 Local R3 验收均已完成。最终 `pnpm verify:task:0801 --reuse-local` 为 **22 executable gates PASS**；数据库为 **63 files / 1381 tests PASS**，System Admin 专项 **28/28 PASS**，并发 remove 2-active floor probe PASS，Admin T12 浏览器与 320/375/390/768/1440 responsive/a11y 全部 PASS。

验收期间已把 T12 的 Admin/Consumer fixture 拆成独立身份，保持“System Admin 不进入 Consumer 业务面”的架构边界；Global Delete 与 RLS 历史断言也已同步 membership 模型。详细证据见 [verification-record.md](verification-record.md)。

`AUDIT_REPORT.md` 继续作为未跟踪审计清单，不应误加入代码提交。

## 后续边界

本 proposal 不再有实施任务。任何 Production migration、Production Admin 发布或真实 break-glass 演练仍属于独立生产操作，必须按发布流程和明确授权执行。
