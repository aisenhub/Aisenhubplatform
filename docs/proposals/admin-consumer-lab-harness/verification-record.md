# Admin Consumer Lab / Consumer Harness 实施与验证记录

本文件只记录实际执行事实；计划生成时不预填 PASS。

## 项目与基线

- 优化目标：删除完整 Reference Consumer App，以 Admin Consumer Lab + test-only Consumer Conformance Harness 替代。
- 实施范围：Phase 01–05。
- GitHub：`https://github.com/aisenhub/Aisenhubplatform.git`
- 工作分支：`codex/admin-consumer-lab-harness`
- 起始 commit：`54acd1bba16500849bb0dabe14727315460ec22f`
- 上游依赖：`codex/remove-sdk-contract-first` 尚未合入远端 main；本分支为 stacked follow-up。
- 初始工作区：clean
- 风险：R3
- 数据库迁移：计划无迁移。
- 已知基线缺口：canonical `SubscriptionProduct.reason` 缺 `purchases_paused`；breaking checker 缺新增 required request field 等负向覆盖；前序 Proposal 状态入口部分陈旧。

## 阶段状态总表

| 阶段 | 名称 | 状态 | 已完成 | 剩余/依赖 | commit | push/GitHub |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Contract foundation | 验收通过待推送 | Account spec 1.0.1 补齐 `purchases_paused`；breaking comparator 可单测并解析 local `$ref`；前序 Proposal 当前状态已收口 | commit/push/远端核对 | 待提交 | 未验证 |
| 02 | Consumer Conformance Harness | 未开始 | 未验证 | 01 | 未验证 | 未验证 |
| 03 | Admin Consumer Lab | 未开始 | 未验证 | 01 | 未验证 | 未验证 |
| 04 | 删除 template-preview 与迁移 gates/E2E | 未开始 | 未验证 | 02、03 | 未验证 | 未验证 |
| 05 | 文档与 R3 总体验收 | 未开始 | 未验证 | 04 | 未验证 | 未验证 |

状态只使用：未开始、进行中、已阻塞、验证失败、验收通过待推送、已交付。

## 阶段实施记录

### Phase 01
- 实际修改：Account OpenAPI `info.version`/manifest 升至 1.0.1 并补齐 `purchases_paused`；`openapi-check` 静态比较 Domain `SUBSCRIPTION_PRODUCT_REASONS` 与 canonical enum；breaking checker 拆成 CLI + pure comparator，并新增 6 个自动兼容/破坏性用例；前序 `remove-sdk-contract-first` 当前状态入口与已 push/R3 PASS 事实对齐。
- 与计划偏差：首次全基线执行暴露 Admin response content 可直接 `$ref` schema，初版 comparator 把其误判为 schema 缺失；新增 `mediaSchema` 兼容和回归测试后 Account/Admin 全基线 PASS。没有放宽 compatibility 规则。

### Phase 02
- 实际修改：未验证
- 与计划偏差：未验证

### Phase 03
- 实际修改：未验证
- 与计划偏差：未验证

### Phase 04
- 实际修改：未验证
- 与计划偏差：未验证

### Phase 05
- 实际修改：未验证
- 与计划偏差：未验证

## 验证记录

| 日期 | 阶段 | 代码版本 | 命令/操作 | 环境 | 退出码 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-09 | 计划 | 54acd1b | `pnpm docs:check`；`git diff --check` | Local | 0 | PASS：Proposal 110 documents 导航/链接一致，plan-only diff clean |
| 2026-10-09 | 01 | worktree | `node --test tooling/scripts/src/contract-breaking-check.test.mjs`（初版） | Local | 0 | PASS：5 个用例覆盖 required request field、parameter、response/enum、security、兼容扩展 |
| 2026-10-09 | 01 | worktree | `pnpm contracts:breaking`（首次强化版） | Local | 1 | FAIL：Admin 40 个 response schema 假阳性；定位为 response content 直接 `$ref` schema 未被 resolver 正确识别 |
| 2026-10-09 | 01 | worktree | changed-file `oxfmt --check` | Local | 1 | FAIL：4 个新/改 JS 文件格式不一致；仅格式化这些文件后复测 |
| 2026-10-09 | 01 | worktree | changed-file `oxfmt --check`（修复后） | Local | 0 | PASS：6 个 Phase 01 代码/JSON 文件格式一致 |
| 2026-10-09 | 01 | worktree | `pnpm contracts:check` | Local | 0 | PASS：Account 22/Admin 45；4 contracts/39 fields；`purchases_paused` Domain/OpenAPI enum 对齐 |
| 2026-10-09 | 01 | worktree | `pnpm contracts:breaking`（resolver 修复后） | Local | 0 | PASS：相对 origin/main 无 breaking；兼容 canonical 路径迁移 |
| 2026-10-09 | 01 | worktree | `pnpm test:tooling` | Local | 0 | PASS：8 tests，其中 breaking checker 6 tests、Local guard 2 tests |
| 2026-10-09 | 01 | worktree | `pnpm docs:check` | Local | 0 | PASS：110 documents |
| 2026-10-09 | 01 | worktree | `git diff --check` | Local | 0 | PASS |

## GitHub 交付记录

| 阶段 | commit SHA | 分支 | push | 远端核对 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 01 | 未验证 | codex/admin-consumer-lab-harness | 未验证 | 未验证 | - |
| 02 | 未验证 | codex/admin-consumer-lab-harness | 未验证 | 未验证 | - |
| 03 | 未验证 | codex/admin-consumer-lab-harness | 未验证 | 未验证 | - |
| 04 | 未验证 | codex/admin-consumer-lab-harness | 未验证 | 未验证 | - |
| 05 | 未验证 | codex/admin-consumer-lab-harness | 未验证 | 未验证 | - |

## 交接信息

- 下一阶段：Phase 01 Contract foundation。
- 当前未提交修改：本 Proposal 文档创建，归本任务。
- 生产部署/真实支付/费用/Production 数据：未授权且不在范围。
