# OPT-004 实施与验证记录

## 基线

- 起始 main：`80a260bc43738b168d6521ccdbe51cb99eef929f`
- 分支：`codex/opt-004-platform-overview`
- 初始工作区：clean，`main == origin/main`。
- 环境：Local Windows + Docker Desktop + Local Supabase；Production 不在授权范围。
- 风险：R3。

## 阶段状态

| 阶段 | 状态 | 已完成 | 剩余 |
| --- | --- | --- | --- |
| 01 聚合合同 | 进行中 | 当前事实核对、指标口径冻结 | migration/API/OpenAPI/tests/fresh/upgrade |
| 02 Admin UI | 待开始 | 无 | Overview/browser/R3/Git closeout |

## 验证记录

| 日期 | 阶段 | 操作 | 环境 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-10-11 | 预研 | main/worktree、Platform Overview、账户/订阅/订单 schema、Admin API/OpenAPI 重新核对 | Local | PASS：确认需新增权威聚合边界；Feedback/Gallery 尚不存在，收入口径不在本项实现 |

## 交接

- 当前无产品决策阻塞。
- 下一步：创建 forward migration `admin_platform_overview`，补 pgTAP/API/OpenAPI，再做 fresh/upgrade R3。
- 不应重复实施：OPT-003 Identity lifecycle；Global Billing observability；后续 OPT-007/008/009/010 目标域。

