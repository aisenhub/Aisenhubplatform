# 阶段 03：Config / Storage 单轨化

状态：Completed（2026-10-14）；本阶段成果已随 Phase 07 发布，准确验证与交付版本见总验证记录。

前置：阶段 01。

覆盖：LC-05、LC-07、LC-10；R-12。

## 目标

保留成熟的私有 Storage 状态机能力，但删除“legacy generic file product”。最终物理对象只能通过 Config Version 业务关系被创建和访问。

## 数据与函数清理

1. 删除 `platform_config_files.resource_kind` 或将表重建为只承载 Config Version 的 ledger，不再支持 `legacy` 分支。
2. 删除 `file_intent_create/file_upload_state/file_receive_claim/...` 等只包装 `resource_kind='legacy'` 的 public-domain private wrappers。
3. 保留并重命名 Config Version 实际使用的 fencing、lease、prepare/finalize、unknown outcome primitive，使名称表达其 canonical 职责。
4. 删除旧账户 `max_files/max_total_bytes` 产品配额；保留单对象上限与平台物理容量。Config 数量继续由 entitlement `config_slot_limit` 控制。
5. Global Delete / retention cleanup 只遍历 Config Version ledger，测试删除语义不因去掉 legacy kind 而退化。

## Runtime/UI

1. Account API 删除 `/v1/config-files` dispatch 和 files.ts legacy content branch。
2. Admin generic config-files API 删除；如果“Storage 状态”仍需要，建立 Config/Version scoped diagnostic endpoint。
3. `platform-files-page`（配置资源页）不再展示“legacy 区域”，只展示 Config pool/review/gallery + 与 Version 关联的技术存储状态。
4. BFF allowlist 同步收紧。

## R-12 Config list cursor

如果列表要求真正稳定分页，不再以 mutable `updated_at` 作为边界。推荐：

- canonical sort 使用 immutable `(created_at desc, id desc)`；
- `updated_at` 仅作为展示/筛选字段；
- cursor opaque 编码 created_at+id；
- 若产品坚持“最近更新排序”，必须承认它是 live/best-effort list，不能继续命名 stable。当前计划优先选择 immutable sort。

测试：第一页后更新 cursor row/邻近 row，再读取下一页，不得 404、重复或漏掉原快照排序中的边界项。

## 验收

- repo runtime 不再出现 `resource_kind='legacy'` 产品分支；
- `/v1/config-files` 和 Admin legacy file CRUD 不存在；
- Config Version 上传/下载/替换/删除/unknown-outcome/Global Delete 正常；
- Storage private 与 executor 权限保持；
- Config pagination mutation-between-pages 回归通过。
