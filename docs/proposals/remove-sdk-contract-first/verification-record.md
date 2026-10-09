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
| 02 | Reference Consumer 无 Account SDK/Domain | 已交付 | app-local bounded input/public contract/Account fetch/fail-closed authorization 已实施；Reference Consumer 已无 account-server/domain 依赖 | 无 | 996913275b6c9d8c0e2c2b0692eea227c05ce3fd | 已 push 并核对远端分支 |
| 03 | Auth/BFF 去 SDK 化 | 验收通过待推送 | Reference Consumer/Admin app-local Auth 已接管 Cookie/session/replay/Supabase adapter；两个 app 已无 Auth SDK import | GitHub 网络恢复后 push | 2d4eff5 | push 阻塞：无法连接 github.com:443 |
| 04 | 删除 SDK package/发行链 | 验收通过待推送 | 三个 Account SDK package、SDK pack/output、SDK/install probes 与 build 前置已删除；Registry 已切到 contract compatibility | GitHub 网络恢复后 push | c94f5d6 | push 阻塞继承自当前网络环境 |
| 05 | Contract/Reference gates | 验收通过待推送 | 新增 Reference Consumer 架构 probe；consumer owner 清单移除 SDK owner；TASK-0801 已切换到 breaking/registry/reference gates | GitHub 网络恢复后 push | b552fe5 | push 阻塞继承自当前网络环境 |
| 06 | 文档与 R3 总体验收 | 验证失败 | architecture/reference/guides/onboarding 已同步；静态/构建/单元/API/DB/合同均通过 | 稳定并重跑 T16/完整 R3 gate；随后 commit/push | 待提交 | 未验证 |

状态只使用：未开始、进行中、已阻塞、验证失败、验收通过待推送、已交付。

## 实施记录

### Phase 01
- 实际修改：Account/Admin OpenAPI 从 `docs/reference/contracts` 移到 `contracts/*/v1/openapi.json`；新增 contract manifest、compatibility/changelog、`contracts:breaking`；OpenAPI checker 删除固定 22-operation 限制；consumer manifest/Admin allowlist/docs checker 路径同步。
- 与计划偏差：breaking checker 采用仓库内 Node 实现，不新增第三方 CLI，符合设计中的供应链收敛选择。

### Phase 02
- 实际修改：新增 `app/_lib/integration` 本地 bounded-body、validation、public contract 与 fail-closed authorization；recent proof/protected route 改用标准 HTTP；subscription/BFF 退出 `@kit/domain`；package 移除 `@kit/account-server`/`@kit/domain`。
- 与计划偏差：`pnpm --filter template-preview test:unit` 在 package metadata 变化后自动完成一次 workspace dependency resolution 并同步 lockfile，无新增外部依赖。

### Phase 03
- 实际修改：在 `apps/template-preview/app/_lib/auth` 与 `apps/admin/app/_lib/auth` 建立 app-local core/cookie/server/browser-session/browser；所有 Auth/BFF/UI import 改为 app-local；两个 app 直接声明 Supabase SSR/client 依赖；Admin 移除 `transpilePackages` 中的旧 Auth package。
- 安全回归：Reference Consumer 迁入原 adapter、safe-returnTo、refresh single-flight、mutation replay、logout epoch/BroadcastChannel 等关键测试；Admin 保留 MFA attestation、AAL2/recent-MFA 与 BFF allowlist 测试。

### Phase 04
- 实际修改：删除 `packages/account-auth`、`packages/account-auth-nextjs`、`packages/account-server`，删除 SDK pack/output 工具、SDK package probe 与旧 Account Consumer tarball install probe；root build/typecheck 不再运行 `sdk:pack`；Admin Vercel build 删除 SDK 前置；Registry schema 升级并改为 Account/Admin `v1` contract compatibility；lockfile 重算后 workspace 收敛为 8 个有效包。
- 有意保留：`packages/domain` 继续作为中央内部模块；`test:consumer:fe-r1-ui` 只验证共享 UI 独立安装，与 Account Consumer SDK 无关；`task-0801` 的旧 SDK gate 在 Phase 05 统一替换。

### Phase 05
- 实际修改：新增 `test:registry` 与 `test:reference-consumer`；Reference Consumer probe 检查 package/source forbidden dependency、app-local Auth/BFF/protected 文件和 Registry canonical contracts；`contract-consumers.json` 移除已删除的 `account-server`/SDK test owners；TASK-0801 用 `contracts:breaking`、Registry 与 Reference Consumer gates 替换旧 SDK package/install gates。
- 未放宽项：原 format/lint/typecheck/build/unit/API/DB/concurrency/runtime/browser/docs/contracts gates 均保留。

### Phase 06
- 实际修改：architecture overview/frontends、API/contracts/configuration/data-model、testing/development/release/operations、Registry 与 AGENTS 导航同步到 Contract-First；平台接入手册重写为“固定 contract major → 配置 Auth/API/Platform Key → 复制并自行拥有 Reference Consumer Auth/BFF/integration → 最小闭环 → 独立验收”；删除 `docs/reference/sdk.md`。历史 archive/review 的过去 SDK 事实保留。
- 格式收敛：首次最终 `format:check` 报 12 个本次阶段修改文件格式不一致；运行仓库 `format:fix` 后复测通过，因此 Phase 06 包含这些文件的纯格式变更。
- R3 诊断与修复：canonical OpenAPI 要求 ordinary recent-proof 使用 Platform Key，但 Reference Consumer reauth BFF 曾显式 `requirePlatformKey: false`，且 reference API 文档仍写无需 Key；已改为服务端注入 Key并同步文档。T16 同时补充 Consumer/Admin hydration gate、Profile/Preferences 用户可见完成状态等待、上传/reauth 脱敏错误码，以及中断 T16 合成 `system_admin` 不再被当作 previous admin 恢复的 fixture 防污染逻辑。
- R3 最终状态：重建后的 T16 20 项浏览器/HTTP 矩阵、T12 ordinary-proof 真实 Local Auth/DB/API probe 已 PASS；进一步把服务 ready gate 收紧为“200 + HTML marker”，并移除 T16 人工压缩到 15 秒的全局 Playwright UI/action timeout。恢复 Docker 后未 reset 数据库，确认 `private.system_admin` 为空，DB 58 files / 1082 tests PASS；最终 `pnpm verify:task:0801 --reuse-local` 退出码 0，21 个 executable gates 全部 PASS。Phase 06 已通过 R3，当前仅待 commit/push 与远端 SHA 核对后标记交付。

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
| 2026-10-08 | 03 | worktree | `pnpm --filter template-preview test:unit` | Local | 0 | PASS：6 files / 44 tests；含 14 个 browser-session 并发/恢复测试、9 个 server adapter 测试 |
| 2026-10-08 | 03 | worktree | `pnpm --filter admin test:unit` | Local | 0 | PASS：5 files / 22 tests；Admin MFA/BFF/security 回归通过 |
| 2026-10-08 | 03 | worktree | `pnpm --filter template-preview typecheck` | Local | 0 | PASS |
| 2026-10-08 | 03 | worktree | `pnpm --filter admin typecheck` | Local | 0 | PASS |
| 2026-10-08 | 03 | worktree | `pnpm --filter template-preview build` | Local | 0 | PASS：Next 16 production build 完成 |
| 2026-10-08 | 03 | worktree | `pnpm --filter admin build` | Local | 0 | PASS：Next 16 production build 完成 |
| 2026-10-08 | 03 | worktree | `git grep -n @kit/account-auth -- apps/template-preview apps/admin` | Local | 1 | PASS（预期无匹配）：两个 app 不再 import Auth SDK |
| 2026-10-08 | 03 | 2d4eff5 | `git push` | Local/GitHub | 128 | BLOCKED：GitHub HTTPS 连接被 reset；本地 commit 完整保留 |
| 2026-10-08 | 03 | 2d4eff5 | `git push`（重试） | Local/GitHub | 128 | BLOCKED：无法连接 `github.com:443`，未声称已交付 |
| 2026-10-08 | 04 | worktree | `pnpm install --lockfile-only` | Local | 0 | PASS：workspace 解析为 9 个 project（root + 8 workspace），lockfile 更新且 supply-chain policy 通过 |
| 2026-10-08 | 04 | worktree | `pnpm test:registry:m5-04` | Local | 0 | PASS：Registry contract compatibility、模板覆盖与 secret boundary 通过 |
| 2026-10-08 | 04 | worktree | `pnpm test:tooling` | Local | 0 | PASS：2/2 tooling safety tests |
| 2026-10-08 | 04 | worktree | `pnpm runtime:probe` | Local | 0 | PASS：Node/Deno 均可导入保留的 central `packages/domain` Edge boundary |
| 2026-10-08 | 04 | worktree | `pnpm typecheck` | Local | 0 | PASS：Turbo 只包含 8 个现存 workspace，6/6 typecheck tasks 成功 |
| 2026-10-08 | 04 | worktree | `pnpm build` | Local | 0 | PASS：Admin + Reference Consumer production build 成功，未运行 SDK pack |
| 2026-10-08 | 04 | worktree | `pnpm test:unit` | Local | 0 | PASS：Domain 13、UI 36、Admin 22、Reference Consumer 44 tests，4/4 tasks 成功 |
| 2026-10-08 | 04 | worktree | `git diff --check` | Local | 0 | PASS |
| 2026-10-08 | 05 | worktree | `pnpm contracts:check` | Local | 0 | PASS：Account 22/Admin 45 operations；4 contracts / 39 fields ownership 对齐 |
| 2026-10-08 | 05 | worktree | `pnpm contracts:breaking` | Local | 0 | PASS：相对 `origin/main` 无 wire breaking change |
| 2026-10-08 | 05 | worktree | `pnpm test:registry` | Local | 0 | PASS：contract compatibility、模板/Secret 边界通过 |
| 2026-10-08 | 05 | worktree | `pnpm test:reference-consumer` | Local | 0 | PASS：forbidden dependency/source import 均不存在，必需 integration/auth 与 canonical contract 存在 |
| 2026-10-08 | 05 | worktree | `pnpm test:tooling` | Local | 0 | PASS：2/2 tooling safety tests |
| 2026-10-08 | 05 | worktree | `pnpm runtime:probe` | Local | 0 | PASS：Node/Deno shared boundary |
| 2026-10-08 | 05 | worktree | `node --check tooling/scripts/src/task-0801.mjs` | Local | 0 | PASS |
| 2026-10-08 | 05 | worktree | TASK-0801 旧 SDK gate grep | Local | 1 | PASS（预期无匹配）：不再引用 SDK package/install tests |
| 2026-10-08 | 05 | worktree | `git diff --check` | Local | 0 | PASS |
| 2026-10-08 | 06 | worktree | `pnpm toolchain:check` | Local | 0 | PASS：Node 24.19.0 / pnpm 11.18.0 / Deno 2.9.6 / Supabase CLI 2.111.0 |
| 2026-10-08 | 06 | worktree | `pnpm format:check`（首次） | Local | 1 | FAIL：12 个本次修改代码/JSON 文件需 oxfmt；保留失败记录 |
| 2026-10-08 | 06 | worktree | `pnpm format:fix && pnpm format:check` | Local | 0 | PASS：401 files 格式一致 |
| 2026-10-08 | 06 | worktree | `pnpm lint` | Local | 0 | PASS：0 warnings / 0 errors，338 files |
| 2026-10-08 | 06 | worktree | `pnpm typecheck` | Local | 0 | PASS：8 workspaces in scope，6/6 typecheck tasks |
| 2026-10-08 | 06 | worktree | `pnpm build` | Local | 0 | PASS：Admin + Reference Consumer production build |
| 2026-10-08 | 06 | worktree | `pnpm test:unit` | Local | 0 | PASS：Domain 13、UI 36、Admin 22、Reference Consumer 44 tests |
| 2026-10-08 | 06 | worktree | `pnpm test:tooling` | Local | 0 | PASS：2/2 tooling safety tests |
| 2026-10-08 | 06 | worktree | `pnpm contracts:check` | Local | 0 | PASS：Account 22/Admin 45；4 contracts / 39 fields ownership |
| 2026-10-08 | 06 | worktree | `pnpm contracts:breaking` | Local | 0 | PASS：相对 origin/main 无 `/v1` wire breaking |
| 2026-10-08 | 06 | worktree | `pnpm test:registry` | Local | 0 | PASS：contract compatibility、route inventory、secret boundary |
| 2026-10-08 | 06 | worktree | `pnpm test:reference-consumer` | Local | 0 | PASS：forbidden dependency/source import 与 canonical contract 检查 |
| 2026-10-08 | 06 | worktree | `pnpm runtime:probe` | Local | 0 | PASS：Node/Deno shared Edge boundary |
| 2026-10-08 | 06 | worktree | `pnpm docs:check` | Local | 0 | PASS：101 documents、required entries、local links/navigation 一致 |
| 2026-10-08 | 06 | worktree | `git diff --check` | Local | 0 | PASS |
| 2026-10-08 | 06 | worktree | active runtime/package 静态搜索 | Local | 0 | PASS：apps 无旧 account-auth/account-server；Reference Consumer 无 `@kit/domain`；root/Admin Vercel 无 `sdk:pack` |
| 2026-10-08 | 06 | worktree | canonical OpenAPI 路径核对 | Local | 0 | PASS：只返回 `contracts/account/v1/openapi.json` 与 `contracts/admin/v1/openapi.json` |
| 2026-10-08 | 06 | worktree | `pnpm verify:task:0801 --reuse-local` | Local Supabase | 1 | FAIL：此前 format/lint/typecheck/build/unit/tooling、Edge/API 97 tests、DB 58 files/1082 assertions、结算并发、Contract/Registry/Reference/runtime 均通过；T16 文件内容上传期望 202 实得 503，任务在此停止 |
| 2026-10-08 | 06 | worktree | `pnpm test:e2e:t16-r2`（诊断重跑） | Local Supabase | 1 | FAIL：已越过前次文件上传点；随后 Admin MFA “验证并继续”后等待 `/admin` 导航 15s 超时，失败点与首轮不同 |
| 2026-10-08 | 06 | worktree | `pnpm test:e2e:t12-r2`（诊断尝试） | Local | 1 | INVALID INVOCATION：直接命令缺 TASK-0801 注入的 Local Supabase env/T12 fixture 参数；不计作产品回归证据，完整 gate 因 T16 提前失败未运行到 T12 |
| 2026-10-09 | 06 | worktree | `T12_PLATFORM_KEY_HMAC_SECRET=... pnpm test:api:t12-ordinary-proof` | Local Supabase | 0 | PASS：emailAuthEvent、independentSession、centralProof、originalSessionBinding、pendingGlobalDelete、accountClose、temporarySessionRevoked 全部 PASS |
| 2026-10-09 | 06 | worktree | `pnpm --filter template-preview typecheck` + `pnpm --filter admin typecheck` | Local | 0 | PASS：reauth/key 与 hydration 修复类型检查通过 |
| 2026-10-09 | 06 | worktree | `pnpm build` | Local | 0 | PASS：8 workspace scope；Admin + Reference Consumer Next 16 production build 成功，最终 route inventory 正常 |
| 2026-10-09 | 06 | worktree | `pnpm test:e2e:t16-r2`（完整 fixture env，重新 build 后） | Local Supabase | 0 | PASS：20 项矩阵全绿，含 fileUploadDownloadDelete、profilePreferences、adminAal1AndSuspend、multiTabTerminal、networkUnknownSensitiveMutation、ordinaryProof、closeDelete、browserBundleCredentials |
| 2026-10-09 | 06 | worktree | `pnpm verify:task:0801 --reuse-local`（首次最终候选） | Local Supabase | 1 | FAIL：仅新改 T16 文件格式不一致，任务在最前面的 format gate 停止；随后单文件 oxfmt + 全仓 `format:check` PASS |
| 2026-10-09 | 06 | worktree | `pnpm verify:task:0801 --reuse-local`（格式修正后） | Local Supabase | 1 | BLOCKED：format/lint/typecheck/build/unit/tooling 与 Edge/API 97/97 已 PASS；DB pgTAP 6 个文件在 fixture insert 遭 `private.system_admin(singleton_id=1)` duplicate，属复用库状态污染，非断言失败 |
| 2026-10-09 | 06 | worktree | 查询 `private.system_admin` + `auth.users` | Local Supabase | 0 | PASS（诊断）：现存 singleton 明确指向 `t16-r2-admin-...@example.test` 合成管理员，可安全归因为中断 T16 fixture 残留 |
| 2026-10-09 | 06 | worktree | `pnpm db:start` | Local | 1 | BLOCKED：恢复会话后 Docker Desktop daemon 不可用，Supabase CLI 无法连接 Docker API；未执行 db reset、未清理其他本地数据 |
| 2026-10-09 | 06 | worktree | 最终非 Docker 复验：`format:check`、`lint`、`typecheck`、`test:unit`、`test:tooling`、`contracts:check`、`contracts:breaking`、`test:registry`、`test:reference-consumer`、`runtime:probe`、`docs:check`、`git diff --check` | Local | 0 | PASS：401 files 格式一致；lint 0/0；8 workspace / 6 typecheck tasks；unit Domain 13/UI 36/Admin 22/Reference Consumer 44；tooling 2/2；Account 22/Admin 45 与 4 contracts/39 fields；breaking/Registry/Reference/runtime/docs/diff 全绿 |
| 2026-10-09 | 06 | worktree | 启动 `D:\APP\Base\DockerDesktop\Docker Desktop.exe`；`docker info`；`pnpm db:start` | Local | 0 | PASS：Docker Server 29.7.2；Local Supabase 恢复且复用既有数据，未执行 reset |
| 2026-10-09 | 06 | worktree | 条件清理 T16 synthetic `system_admin` + 只读复核 | Local Supabase | 0 | PASS：条件删除返回 `NO_MATCH_NO_CHANGE`，未删除任何行；随后查询 `private.system_admin` 返回 `[]` |
| 2026-10-09 | 06 | worktree | `pnpm test:db` | Local Supabase | 0 | PASS：58 files / 1082 tests，全部成功 |
| 2026-10-09 | 06 | worktree | `pnpm verify:task:0801 --reuse-local`（readiness 修复前） | Local Supabase | 1 | FAIL：此前 format/lint/typecheck/build/unit/tooling、API 97/97、DB 58/1082、并发、breaking/Registry/Reference/runtime 全部 PASS；T16 在首个公共页面 heading 的固定 15 秒 UI 等待超时，定位为 harness readiness/timeout 不稳定性 |
| 2026-10-09 | 06 | worktree | T16 readiness/UI harness 修正 | Local | 0 | PASS：服务 ready 必须满足 200 + 预期 HTML marker；Consumer `/files` 纳入启动探针；移除自定义 15 秒全局 Playwright UI/action timeout，保留 API/browser fetch 显式 deadline |
| 2026-10-09 | 06 | worktree | `pnpm verify:task:0801 --reuse-local`（最终候选） | Local Supabase | 0 | PASS：`TASK-0801 PASS: 21 executable gates passed.`；API 97/97、DB 58/1082、settlement concurrency、breaking/Registry/Reference/runtime、T16 20 项矩阵、T12 Admin MFA/step-up/a11y、docs 101、OpenAPI Account 22/Admin 45 与 4 contracts/39 fields 全部通过 |

## GitHub 交付记录

| 阶段 | commit SHA | 分支 | push | 远端核对 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 01 | 919559107c105c02279f41f68c307115639ffc6d | codex/remove-sdk-contract-first | 已 push | 已核对 | Contract baseline |
| 02 | 996913275b6c9d8c0e2c2b0692eea227c05ce3fd | codex/remove-sdk-contract-first | 已 push | 已核对 | Reference Consumer HTTP integration |
| 03 | 2d4eff5 | codex/remove-sdk-contract-first | 失败：网络不可达 | 未核对 | 本地 commit 已完成，待网络恢复 push |
| 04 | c94f5d6 | codex/remove-sdk-contract-first | 未重试：已知网络不可达 | 未核对 | 本地 commit 已完成，待网络恢复 push |
| 05 | b552fe5 | codex/remove-sdk-contract-first | 未重试：已知网络不可达 | 未核对 | 本地 commit 已完成，待网络恢复 push |
| 06 | 未验证 | codex/remove-sdk-contract-first | 未验证 | 未验证 | - |

## 交接信息

- Phase 01–06 实施与 R3 验收已完成；最终 `verify:task:0801 --reuse-local` 21 个 executable gates 全部 PASS。Phase 06 当前只剩 commit、push 与远端 SHA 核对，完成前不标“已交付”。
- Phase 03–05 曾有 GitHub 网络阻塞记录；交付收尾应重新尝试推送当前任务分支，并以远端 branch SHA 是否等于本地 HEAD 为准，不沿用旧网络状态作结论。
- 生产部署/真实支付/费用/Secret/数据操作均不在本任务授权范围。
- main 合并前必须确认生产自动部署绑定；未知时保留在任务分支。
