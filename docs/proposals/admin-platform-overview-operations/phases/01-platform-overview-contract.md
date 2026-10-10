# 阶段 01：平台 Overview 聚合合同

状态：执行中

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

新增 Admin-only 平台运营聚合函数与 `GET /admin/api/v1/platforms/{platformId}/overview`，固定 7/30/90 天口径并覆盖权限、时间边界与消费者合同。

## 任务

- [ ] DB-001：forward migration 新增 `private.admin_platform_overview`。
- [ ] DB-002：pgTAP 覆盖当前/上一周期、paid account、orders/attention、权限、非法 days、missing platform。
- [ ] API-001：Admin Edge GET route 与 400/404 映射。
- [ ] CONTRACT-001：OpenAPI schema/operation 与 Consumer Lab snapshot 同步。
- [ ] BFF-001：Next Admin allowlist 放行精确 overview GET。
- [ ] R3-001：upgrade + fresh + full DB/API/contracts 通过。

## 退出条件

以上全部 PASS 且最终 diff 无未解释问题后进入 Phase 02。

