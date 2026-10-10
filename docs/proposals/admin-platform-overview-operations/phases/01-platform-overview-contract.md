# 阶段 01：平台 Overview 聚合合同

状态：完成

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

新增 Admin-only 平台运营聚合函数与 `GET /admin/api/v1/platforms/{platformId}/overview`，固定 7/30/90 天口径并覆盖权限、时间边界与消费者合同。

## 任务

- [x] DB-001：forward migration 新增 `private.admin_platform_overview`。
- [x] DB-002：pgTAP 覆盖当前/上一周期、paid account、orders/attention、权限、非法 days、missing platform。
- [x] API-001：Admin Edge GET route 与 400/404 映射。
- [x] CONTRACT-001：OpenAPI schema/operation 与 Consumer Lab snapshot 同步。
- [x] BFF-001：Next Admin allowlist 放行精确 overview GET。
- [x] R3-001：upgrade + fresh + full DB/API/contracts 通过。

## 实际验证

- 定向 pgTAP：16/16 PASS。
- API：97/97 PASS。
- Admin unit：11 files / 51 tests PASS。
- OpenAPI：Admin 48 operations；Consumer Lab snapshot/compatibility PASS；breaking check PASS。
- DB upgrade：62 files / 1146 tests PASS。
- DB fresh reset：应用至 `20261010223414_admin_platform_overview.sql`，62 files / 1146 tests PASS。
- 静态质量：format 392 files PASS；lint 0 warnings / 0 errors；docs 149；`git diff --check` PASS。

## 退出条件

以上全部 PASS 且最终 diff 无未解释问题后进入 Phase 02。

