# Remove SDK / Contract-First 实施与验证记录

本文件只记录实际执行事实；失败和未运行项保留，不把计划写成 PASS。

## 项目与基线

- 优化目标：移除 Consumer Runtime SDK，迁移到 Contract-First HTTP integration。
- 实施范围：Proposal Phase 01–06。
- GitHub 仓库：`https://github.com/aisenhub/Aisenhubplatform.git`
- 工作分支：`codex/remove-sdk-contract-first`
- 起始 commit：`a360737f07935a0a84428b28702e25a763b10fca` (`origin/main`)
- 初始工作区状态：clean
- 风险级别：R3
- 数据库迁移：计划无迁移；实施中若发现需要迁移，先回写设计/计划。
- 已知基线失败：未验证

## 阶段状态总表

| 阶段 | 名称 | 状态 | 已完成 | 剩余/依赖 | commit | push/GitHub |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Contract baseline 与治理 | 已交付 | OpenAPI canonical 路径、compatibility/changelog/manifest、breaking checker、路径引用已实施并通过定向验证 | 无 | 919559107c105c02279f41f68c307115639ffc6d | 已 push 并核对远端分支 |
| 02 | Reference Consumer 无 Account SDK/Domain | 验收通过待推送 | app-local bounded input/public contract/Account fetch/fail-closed authorization 已实施；Reference Consumer 已无 account-server/domain 依赖 | commit/push | 未验证 | 未验证 |
| 03 | Auth/BFF 去 SDK 化 | 未开始 | 未验证 | 02 | 未验证 | 未验证 |
| 04 | 删除 SDK package/发行链 | 未开始 | 未验证 | 03 | 未验证 | 未验证 |
| 05 | Contract/Reference gates | 未开始 | 未验证 | 04 | 未验证 | 未验证 |
| 06 | 文档与 R3 总体验收 | 未开始 | 未验证 | 05 | 未验证 | 未验证 |

状态只使用：未开始、进行中、已阻塞、验证失败、验收通过待推送、已交付。

## 实施记录

### Phase 01
- 实际修改：Account/Admin OpenAPI 从 `docs/reference/contracts` 移到 `contracts/*/v1/openapi.json`；新增 contract manifest、compatibility/changelog、`contracts:breaking`；OpenAPI checker 删除固定 22-operation 限制；consumer manifest/Admin allowlist/docs checker 路径同步。
- 与计划偏差：breaking checker 采用仓库内 Node 实现，不新增第三方 CLI，符合设计中的供应链收敛选择。

### Phase 02
- 实际修改：新增 `app/_lib/integration` 本地 bounded-body、validation、public contract 与 fail-closed authorization；recent proof/protected route 改用标准 HTTP；subscription/BFF 退出 `@kit/domain`；package 移除 `@kit/account-server`/`@kit/domain`。
- 与计划偏差：`pnpm --filter template-preview test:unit` 在 package metadata 变化后自动完成一次 workspace dependency resolution 并同步 lockfile，无新增外部依赖。

### Phase 03
- 实际修改：未开始。

### Phase 04
- 实际修改：未开始。

### Phase 05
- 实际修改：未开始。

### Phase 06
- 实际修改：未开始。

## 验证记录

| 日期 | 阶段 | 代码版本 | 命令/操作 | 环境 | 退出码 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-08 | 基线 | a360737f | branch/head/remote/worktree 核对 | Local | 0 | PASS：工作区 clean，新任务分支从最新 `origin/main` 创建 |
| 2026-10-08 | 01 | worktree | `pnpm contracts:check` | Local | 0 | PASS：Account 22/Admin 45 operations；refs/sample/binary/no-store 和 consumer matrix 通过 |
| 2026-10-08 | 01 | worktree | `pnpm contracts:breaking` | Local | 0 | PASS：识别 base 的旧合同路径，确认本次移动无 wire breaking change |
| 2026-10-08 | 01 | worktree | `pnpm --filter admin test:unit` | Local | 0 | PASS：5 files / 22 tests |
| 2026-10-08 | 01 | worktree | `pnpm docs:check`（首次） | Local | 1 | FAIL：`contracts.md` 旧链接和 Proposal agent-handoff 不可达；保留失败记录 |
| 2026-10-08 | 01 | worktree | 修正链接后 `pnpm docs:check` | Local | 0 | PASS：102 documents 可达且本地链接一致 |
| 2026-10-08 | 02 | worktree | `pnpm --filter template-preview test:unit` | Local | 0 | PASS：最终 3 files / 19 tests；包含 bounded input、upload gate、fail-closed entitlement 负例 |
| 2026-10-08 | 02 | worktree | `pnpm --filter template-preview typecheck` | Local | 0 | PASS |
| 2026-10-08 | 02 | worktree | `pnpm --filter template-preview build` | Local | 0 | PASS：Next 16 production build，15 条 app routes 成功生成 |
| 2026-10-08 | 02 | worktree | `git grep -E @kit/account-server\|@kit/domain -- apps/template-preview` | Local | 1 | PASS（预期无匹配）：Reference Consumer 源码/package 已无两类依赖 |

## GitHub 交付记录

| 阶段 | commit SHA | 分支 | push | 远端核对 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 01 | 919559107c105c02279f41f68c307115639ffc6d | codex/remove-sdk-contract-first | 已 push | 已核对 | Contract baseline |
| 02 | 未验证 | codex/remove-sdk-contract-first | 未验证 | 未验证 | - |
| 03 | 未验证 | codex/remove-sdk-contract-first | 未验证 | 未验证 | - |
| 04 | 未验证 | codex/remove-sdk-contract-first | 未验证 | 未验证 | - |
| 05 | 未验证 | codex/remove-sdk-contract-first | 未验证 | 未验证 | - |
| 06 | 未验证 | codex/remove-sdk-contract-first | 未验证 | 未验证 | - |

## 交接信息

- 当前从 Phase 01 开始。
- 生产部署/真实支付/费用/Secret/数据操作均不在本任务授权范围。
- main 合并前必须确认生产自动部署绑定；未知时保留在任务分支。
