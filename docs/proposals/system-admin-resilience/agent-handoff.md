# System Admin 多管理员与灾备韧性实施交接

状态：In Progress（实现完成，最终 Local R3 验证 BLOCKED）

## 执行入口

开始任何实施前依次阅读：

1. `AGENTS.md`
2. `docs/guides/development-release-workflow.md`
3. 本目录 `design.md`、`plan.md`、当前阶段文件、`verification-record.md`
4. `docs/architecture/modules/identity-security.md`
5. `docs/reference/data-model.md`
6. `docs/guides/operations.md`
7. `docs/proposals/admin-security-mfa-hardening/` 当前实现边界
8. 实际 migration、Account/Admin API、Admin Security/MFA UI 和测试 fixture

## 不得重新发散的决定

- 多管理员是同一 System Admin 权限级别，不做 RBAC。
- 正常运行至少 2 个 active System Admin。
- 新管理员先 pending，双 verified TOTP 后 active。
- online add/activate/remove 要求 recent MFA 和 audit。
- 最少 active 数量算法只在 private domain function 中实现，并发下也必须成立。
- System Admin 必须使用专用 Auth identity；不把普通 Consumer 账号直接晋升。
- Production 日常变更不依赖手工 SQL；首次 bootstrap/全部失联才允许离线 recovery。
- 不新增网页 MFA 绕过入口或隐藏常驻 recovery admin。

## 工作规则

实际实现整体 R3。创建/继续短期任务分支，保留用户已有工作，不改写历史 migration。每阶段使用 Local Supabase 合成身份完成权限、并发和恢复验证；不连接 Production，不执行真实管理员恢复或部署，除非用户另行明确授权。

`AUDIT_REPORT.md` 是未跟踪的当前审计清单；实施时不要误加入无关 commit。S2-05 完成并通过验收后，再按用户要求从该报告移除。

## 当前交接状态（2026-10-14）

实现已完成到最终验收阶段：membership schema、pending/active 授权、双 TOTP readiness、Admin API/UI、2-active 下限、session/recent-proof 撤销、Consumer 身份隔离、offline recovery、合同与文档均已落地。非 Docker 质量门全部通过；数据库隔离 clone 的 forward migration 与专项 pgTAP 曾通过 28/28。

在最终审查中又修正了一个并发 remove 窗口：正常 add/activate/remove 现在都先取得 `system-admin-membership` advisory lock，再在锁内重新检查 actor/session/recent-MFA。新并发 probe 已加入 `pnpm test:sql:system-admin-resilience-concurrency`，但最新版本尚未实际执行。

当前唯一 blocker 是宿主 Docker Desktop：Windows `com.docker.service` 为 STOPPED，当前 Runner 无权限启动（`Access is denied`），因此 Docker API / Local Supabase 不可用。不要把这一环境阻断改写为测试 FAIL，也不要在未跑完 Local R3 gate 前把 proposal 标记 Completed 或合并到 main。

Docker 恢复后依次执行：最新 migration -> `sec_admin_03_system_admin_resilience.sql` -> `pnpm test:sql:system-admin-resilience-concurrency` -> `pnpm test:db` -> 适用 Admin Local E2E。全部 PASS 后更新 verification-record、删除 `AUDIT_REPORT.md` 中最后的验收阻断，再做 commit/push/main 收尾。

