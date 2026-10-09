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
| 01 | Contract foundation | 验收通过待推送 | Account spec 1.0.1 补齐 `purchases_paused`；breaking comparator 可单测并解析 local `$ref`；前序 Proposal 当前状态已收口 | push/远端核对 | 828132c | GitHub connection reset，待重试 |
| 02 | Consumer Conformance Harness | 验收通过待推送 | test-only Node Harness、HttpOnly Auth/CSRF/BFF、thin UI、static+process smoke 已实施 | push/远端核对 | 9299cc5 | 继承 GitHub 网络阻塞 |
| 03 | Admin Consumer Lab | 验收通过待推送 | `/admin/consumer-lab`、canonical contract summary/table、Global 导航与 unit/build 验证已实施 | push/远端核对 | 34b09e3 | 继承 GitHub 网络阻塞 |
| 04 | 删除 template-preview 与迁移 gates/E2E | 验收通过待推送 | Harness 扩至 19 canonical operations；真实 Local Auth/API/Storage E2E；Registry/TASK-0801/consumer ownership 已迁移；旧 app/T16/template inventory 已删除；workspace 收敛为 8 projects | push/远端核对 | 47ed9c1 | GitHub connection reset，待重试 |
| 05 | 文档与 R3 总体验收 | 验收通过待推送 | active architecture/reference/guides 已同步；Admin T12 纳入 Consumer Lab；最终 TASK-0801 20 executable gates PASS | commit/push/远端核对 | 待提交 | 未验证 |

状态只使用：未开始、进行中、已阻塞、验证失败、验收通过待推送、已交付。

## 阶段实施记录

### Phase 01
- 实际修改：Account OpenAPI `info.version`/manifest 升至 1.0.1 并补齐 `purchases_paused`；`openapi-check` 静态比较 Domain `SUBSCRIPTION_PRODUCT_REASONS` 与 canonical enum；breaking checker 拆成 CLI + pure comparator，并新增 6 个自动兼容/破坏性用例；前序 `remove-sdk-contract-first` 当前状态入口与已 push/R3 PASS 事实对齐。
- 与计划偏差：首次全基线执行暴露 Admin response content 可直接 `$ref` schema，初版 comparator 把其误判为 schema 缺失；新增 `mediaSchema` 兼容和回归测试后 Account/Admin 全基线 PASS。没有放宽 compatibility 规则。

### Phase 02
- 实际修改：新增 `tests/consumer-harness` 原生 Node server、canonical operation matcher、极薄 HTML/JS、README；新增递归 static boundary probe 和独立进程 smoke；root 新增 `test:consumer-harness`。Harness 不进入 workspace，不依赖 `@kit/*`/Next/React/Domain/Admin。
- 与计划偏差：本阶段仅完成离线 static/process smoke；真实 Supabase Auth/Account/Storage 行为按计划保留到 Phase 04 迁移现有 T16 fixture 后统一证明。

### Phase 03
- 实际修改：新增 `/admin/consumer-lab`、Global “开发与接入”导航、纯 `contract-summary` helper 与单测；页面 build-time 直接导入根 `contracts/account|admin/v1/openapi.json`，展示 major/version/operation/security 与 Harness 使用边界，不新增 Secret 输入、任意 proxy 或 Admin private API Consumer 模拟。
- 与计划偏差：首次 unit test 错误假设 principal operationId 为 `getAccountPrincipal`，canonical 实际为 `getPrincipal`；修正测试后全量 Admin unit 复测通过。两次 `run_shell` Admin build 因 120 秒 runner 总预算超时，随后用 900 秒结构化 process 重跑同一 production build，最终 exit 0；没有通过修改 build 配置绕过。

### Phase 04
- 实际修改：新增 `tests/spikes/e2e/consumer-harness-local.mjs`，用两个 Harness + 两个平台 Key 在真实 Local Supabase/Auth/DB/Storage 上验证 session/CSRF/platform isolation/activate/subscription/redeem/ETag/files/suspend/logout/invalid refresh；Harness canonical allowlist 扩至 19 operations，覆盖 checkout routes；Registry schema 升为 3.0.0 并改成 Harness + Admin Lab metadata；`contract-consumers.json` 的 Account Consumer owner 改为 Harness contract/BFF；TASK-0801 切到 Harness static + Local E2E；删除 `apps/template-preview`、旧 T16、Reference Consumer probe、`registry/templates.json` 和旧模板 Registry probe；lockfile 重算后为 8 workspace projects。
- 与计划偏差：没有把 3000 行旧 T16 原样“换目录”继续维护，而是按已冻结边界拆掉产品 UI 专属断言，保留并重建协议/安全/领域高价值闭环。新 Local E2E 首次运行因页面尚未导航到 Harness origin 就执行相对 `fetch('/api/v1/plans')` 而失败；前置 `page.goto(baseUrl)` 后同一流程 PASS。Phase 04 全仓 format 首次发现 4 个本阶段文件格式不一致，定向格式化后复测 PASS。

### Phase 05
- 实际修改：将 root/architecture/reference/guides/Registry 当前说明收敛为 canonical OpenAPI + Consumer-owned Auth/BFF + test-only Harness + read-only Admin Consumer Lab；active grep 已无 `apps/template-preview`、`Reference Consumer`、`test:reference-consumer` 或 `registry/templates.json`。T12 Admin 响应式/无障碍矩阵新增 `/admin/consumer-lab`，最终真实浏览器结果为 15 routes × 5 viewports = 75 observations。
- 与计划偏差：单独运行 `pnpm test:e2e:t12-r2` 时因未注入测试要求的 `SUPABASE_LOCAL_URL`/`SUPABASE_LOCAL_ANON_KEY`/`SUPABASE_DB_URL` 在浏览器启动前 fail fast；没有放宽守卫。最终使用仓库 canonical `verify:task:0801 --reuse-local` 注入同一 Local env 后，T12 与全部 R3 gate 均 PASS。

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
| 2026-10-09 | 01 | 828132c | `git push -u origin codex/admin-consumer-lab-harness`（两次） | Local/GitHub | 128 | BLOCKED：两次均为 GitHub HTTPS connection reset；本地 commit 完整保留，Phase 01 保持验收通过待推送 |
| 2026-10-09 | 02 | worktree | `node --check tests/consumer-harness/contract.mjs`（首次） | Local | 1 | FAIL：`.mjs` 误留 TypeScript `as const`；已定位为纯语法错误并修复 |
| 2026-10-09 | 02 | worktree | Harness 四个 JS/MJS + static probe `node --check` | Local | 0 | PASS：修复后语法全部有效 |
| 2026-10-09 | 02 | worktree | `pnpm test:consumer-harness` | Local | 0 | PASS：16 canonical operations、dynamic route、workspace isolation、public secret marker；独立 Node process/UI/CSRF/meta/404/wrong-origin smoke 全绿 |
| 2026-10-09 | 02 | worktree | Harness changed-file `oxfmt --check`（首次） | Local | 1 | FAIL：6 个新文件需格式化；只运行定向 oxfmt 后复测 |
| 2026-10-09 | 02 | worktree | Harness changed-file `oxfmt --check`（修复后） | Local | 0 | PASS：7 个 Harness/package 文件格式一致 |
| 2026-10-09 | 02 | worktree | `pnpm lint` | Local | 0 | PASS：342 files，0 warnings / 0 errors |
| 2026-10-09 | 02 | worktree | `git diff --check` | Local | 0 | PASS |
| 2026-10-09 | 03 | worktree | `pnpm --filter admin test:unit`（首次） | Local | 1 | FAIL：新增 contract-summary 测试错误假设 principal operationId 为 `getAccountPrincipal`；canonical OpenAPI 实际为 `getPrincipal`，修正测试后复测 |
| 2026-10-09 | 03 | worktree | `pnpm --filter admin test:unit`（修复后） | Local | 0 | PASS：6 files / 26 tests，包含 contract summary 与 Consumer Lab 导航 |
| 2026-10-09 | 03 | worktree | `pnpm --filter admin typecheck` | Local | 0 | PASS |
| 2026-10-09 | 03 | worktree | `pnpm --filter admin build`（两次短预算） | Local | timeout | BLOCKED BY RUNNER BUDGET：均在 Next production build 优化阶段超过 120 秒，无编译错误输出 |
| 2026-10-09 | 03 | worktree | `pnpm --filter admin build`（900 秒结构化 process） | Local | 0 | PASS：webpack compile、TypeScript、production build 完成；根 canonical JSON 可直接作为 build 输入 |
| 2026-10-09 | 03 | worktree | changed-file `oxfmt --check`（首次） | Local | 1 | FAIL：`contract-summary.ts` 与 `consumer-lab-page.tsx` 格式不一致；定向格式化后复测 |
| 2026-10-09 | 03 | worktree | changed-file `oxfmt --check`（修复后） | Local | 0 | PASS：6 个 Consumer Lab/navigation 文件格式一致 |
| 2026-10-09 | 03 | worktree | `git diff --check` | Local | 0 | PASS |
| 2026-10-09 | 04 | worktree | `node --check tests/spikes/e2e/consumer-harness-local.mjs` | Local | 0 | PASS：新 Local Harness E2E 语法有效 |
| 2026-10-09 | 04 | worktree | `pnpm test:e2e:consumer-harness`（首次） | Local Supabase/Auth/DB/Storage/Chrome | 1 | FAIL：初始 page 尚无 base URL，相对 `/api/v1/plans` fetch 无法解析；修复为先导航 Harness origin |
| 2026-10-09 | 04 | worktree | `pnpm test:e2e:consumer-harness`（修复后、删除前） | Local Supabase/Auth/DB/Storage/Chrome | 0 | PASS：Harness process、Auth Cookie/CSRF、双平台隔离、activate、redeem、ETag、binary files、suspend fail-closed、logout/invalid refresh 共 9 项 |
| 2026-10-09 | 04 | worktree | `pnpm contracts:check`（Consumer owner 迁移后） | Local | 0 | PASS：Account 22/Admin 45；4 contracts/39 fields，Consumer owner 已指向 Harness |
| 2026-10-09 | 04 | worktree | `pnpm test:consumer-harness` | Local | 0 | PASS：19 canonical operations + static/process boundary |
| 2026-10-09 | 04 | worktree | `pnpm install --lockfile-only --store-dir E:\\AppData\\pnpm` | Local | 0 | PASS：8 workspace projects，旧 template-preview importer 已退出 lockfile |
| 2026-10-09 | 04 | worktree | `pnpm test:registry` | Local | 0 | PASS：manifest/canonical contracts/Harness/Admin Lab/template retirement/browser secret boundary |
| 2026-10-09 | 04 | worktree | active code/test/tooling/registry `git grep template-preview` | Local | 0 | PASS：package/lockfile/registry/tests/tooling/apps 无旧 app 引用 |
| 2026-10-09 | 04 | worktree | `pnpm typecheck` | Local | 0 | PASS：7 typecheck packages scope，无 template-preview |
| 2026-10-09 | 04 | worktree | `pnpm build` | Local | 0 | PASS：7 workspace packages scope；Admin production build 包含 `/admin/consumer-lab` |
| 2026-10-09 | 04 | worktree | `pnpm test:unit` | Local | 0 | PASS：Domain 13、UI 36、Admin 26 tests |
| 2026-10-09 | 04 | worktree | `pnpm test:e2e:consumer-harness`（删除后复测） | Local Supabase/Auth/DB/Storage/Chrome | 0 | PASS：证明 Harness 不依赖已删除 Reference Consumer 代码/产物 |
| 2026-10-09 | 04 | worktree | `pnpm lint` | Local | 0 | PASS：306 files，0 warnings / 0 errors |
| 2026-10-09 | 04 | worktree | `pnpm format:check`（首次） | Local | 1 | FAIL：Consumer matrix、Local E2E、Registry probe、TASK-0801 四个本阶段文件需格式化 |
| 2026-10-09 | 04 | worktree | `pnpm format:check`（修复后） | Local | 0 | PASS：370 files |
| 2026-10-09 | 04 | worktree | `pnpm docs:check` | Local | 1 | EXPECTED PHASE BOUNDARY：10 个 active onboarding 链接仍指向已删除的 `apps/template-preview`/`registry/templates.json`；由 Phase 05 文档迁移负责，未将此结果写成 PASS |
| 2026-10-09 | 04 | 47ed9c1 | `git push -u origin codex/admin-consumer-lab-harness` | Local/GitHub | 128 | BLOCKED：GitHub HTTPS connection reset；Phase 01–04 本地 commits 保留 |
| 2026-10-09 | 05 | worktree | active docs `git grep`（排除 archive/reviews/proposals） | Local | 0 | PASS：无 `apps/template-preview`、`template-preview`、`Reference Consumer`、`test:reference-consumer`、`registry/templates.json` active 命中 |
| 2026-10-09 | 05 | worktree | `pnpm docs:check` | Local | 0 | PASS：110 documents，必需入口、相对链接与导航一致 |
| 2026-10-09 | 05 | worktree | `pnpm contracts:check` | Local | 0 | PASS：Account 22/Admin 45；4 contracts/39 fields |
| 2026-10-09 | 05 | worktree | `pnpm format:check` | Local | 0 | PASS：370 files |
| 2026-10-09 | 05 | worktree | `pnpm test:e2e:t12-r2`（直接调用） | Local | 1 | ENV FAIL：缺少 T12 要求的 Local Supabase env，浏览器未启动；保留守卫，改由 TASK-0801 canonical launcher 注入 |
| 2026-10-09 | 05 | worktree | `pnpm verify:task:0801 --reuse-local` | Local Supabase/Auth/DB/Storage/Chrome | 0 | PASS：20 executable gates；Deno/API 97 tests、DB 58 files/1082 tests、Harness 9 项 Local E2E、Admin MFA/安全流全 PASS；responsive/a11y 75 route-viewports（含 Consumer Lab） |

## GitHub 交付记录

| 阶段 | commit SHA | 分支 | push | 远端核对 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 01 | 828132c | codex/admin-consumer-lab-harness | 失败 | 未核对 | 两次 GitHub HTTPS connection reset |
| 02 | 9299cc5 | codex/admin-consumer-lab-harness | 待推送 | 未核对 | 继承网络阻塞 |
| 03 | 34b09e3 | codex/admin-consumer-lab-harness | 待推送 | 未核对 | 继承网络阻塞 |
| 04 | 47ed9c1 | codex/admin-consumer-lab-harness | 失败 | 未核对 | GitHub HTTPS connection reset |
| 05 | 未验证 | codex/admin-consumer-lab-harness | 未验证 | 未验证 | - |

## 交接信息

- 下一步：仅创建 Phase 05 提交、push 当前任务分支并核对远端 SHA；push 成功后再把 Proposal/各 Phase 标为 Completed/已交付。
- 当前未提交修改：Phase 05 active docs、T12 Consumer Lab 浏览器覆盖与验证记录，归本任务。
- 生产部署/真实支付/费用/Production 数据：未授权且不在范围。
