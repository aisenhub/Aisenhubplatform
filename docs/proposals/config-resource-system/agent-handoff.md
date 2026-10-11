# OPT-007 实施交接

- 当前状态：OPT-007 已完成并进入 `main`
- 基线：`main@ec997111969c6abfda42f57abd179e6fc0bdfb8e`
- 风险：R3
- 最终阶段：[Phase 04](phases/04-lifecycle-release.md) 已完成

## 不可回退的设计约束

1. 不破坏 Account v1 六个 `/config-files` operation；新业务是 additive `/configs` / `/config-gallery`。
2. `platform_config_files` 仍是唯一物理 Storage ledger；新 Version 不能另造上传/删除状态机。
3. Gallery public visibility 只认 Admin-approved immutable Version；Submission pending 不覆盖旧 approved Entry。
4. Storage bucket 保持 private；浏览器不拿 Platform Key、service role、Storage secret 或永久对象 URL。
5. Config slot 来自 entitlement `config_slot_limit`；平台物理总容量来自 Admin policy，两者语义不得混用。
6. remove/block Gallery 不删除个人 Config；删除 Config 才进入物理删除链。
7. “apply count”只表示中央内容交付完成，不表示 Consumer 业务应用成功。
8. 既有 legacy 文件不自动猜测映射成 Config，也绝不自动进 Gallery。
9. 当前无真实外部 Storage backup 证据，不展示“已备份”。
10. Production 未授权，不部署 Production。

## 每阶段执行顺序

1. 从最新 worktree 重新确认本阶段依赖没有被并发修改。
2. schema 变更先用 `supabase migration new` 创建 migration 文件。
3. 最小实现 + 对应 SQL/API/unit tests。
4. Local fresh/upgrade/权限/合同/E2E 验证。
5. 对授权 staging 同步并记录证据；不得以 staging 替代 Local。
6. 更新 phase / verification record，提交阶段 checkpoint，再进入下一阶段。

## 最终退出条件

- [x] 四个 phase 完成。
- [x] Local canonical R3 无 FAIL/BLOCKED。
- [x] staging 与最终产品提交的 migration/function/Edge 一致。
- [x] Account/Admin v1 无 breaking change。
- [x] `a248d8a` 已 fast-forward 到远端 `main`，任务分支本地/远端均已清理。
