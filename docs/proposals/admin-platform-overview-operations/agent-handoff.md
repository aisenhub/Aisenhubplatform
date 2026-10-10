# OPT-004 Agent 执行交接

## 项目

- 项目：`E:\Projects\Aisenhubplatform`
- 任务：OPT-004 单平台运营概览
- 起始 main：`80a260bc43738b168d6521ccdbe51cb99eef929f`
- 当前分支：`codex/opt-004-platform-overview`
- 风险：R3
- 当前阶段：[Phase 02](phases/02-platform-overview-ui.md)

## 关键结论

- Overview 不能从 `accounts?limit=100` 计算全量 KPI。
- 用户事实来自 `platform_accounts`；有效付费账户来自 `subscriptions + plans`；订单事实来自 `billing_orders`。
- 本项不显示收入，不提前实现 Feedback/Gallery。
- 新 SQL 仅只读聚合，Admin-only，固定 search_path，不扩大 Auth PII 权限。
- Phase 01 合同未通过 fresh/upgrade/权限/API 前不进入 UI。

## 不要做

- 不提前实施 OPT-005 导航收敛。
- 不实施 OPT-006 接入向导。
- 不创建 OPT-007/008 尚不存在的数据表作为“占位”。
- 不实施 OPT-009 Account 360 或 OPT-010 商业产品目录。
- 不执行 Production Supabase/Release。

## 完成门槛

- [x] Phase 01 数据/API/合同完成。
- [ ] Phase 02 UI/browser/R3 完成。
- [ ] 必需 Local R3 无 FAIL/BLOCKED。
- [ ] main/远端/分支状态闭环。

