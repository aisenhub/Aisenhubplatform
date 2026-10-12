# 阶段 02：Admin API 与合同

状态：Not Started

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

把 Phase 01 权威 SQL 暴露为兼容的 Admin HTTP contract，并让现有账户治理 API 真正持久化 reason。

## 任务

- [ ] API-001：扩展 `GET /admin/api/v1/platforms/{platformId}/accounts` 的 cursor/filters/next_cursor。
- [ ] API-002：新增 `GET /admin/api/v1/platforms/{platformId}/accounts/{accountId}` Account 360，服务端 exact Auth read 补只读 identity email。
- [ ] API-003：新增 tags replace 与 note add routes。
- [ ] API-004：现有 suspend/restore/close 读取并校验 body.reason，调用 transition v2；保持 `adminStepUp`。
- [ ] CONTRACT-001：Admin OpenAPI additive 更新；BFF allowlist 与 Consumer Lab snapshot 同步。
- [ ] TEST-001：API unit 覆盖 filters/cursor/404/IDOR/Auth unavailable/reason/tags/notes/recent-MFA。
- [ ] TEST-002：`contracts:check` + `contracts:breaking` PASS。

## 退出条件

API/contract 定向验证、Admin contract snapshot 与 breaking gate 全绿后才能进入 Phase 03。
