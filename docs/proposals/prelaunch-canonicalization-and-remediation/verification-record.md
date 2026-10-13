# 预上线单轨化清理与缺陷修复 — 验证记录

本文件只记录实施期间真实发生的命令、结果、失败、修复、提交和环境动作。用户已于 2026-10-13 确认问题清单、兼容清理方向和 8 阶段 Proposal，并授权开始实施；Production 部署仍不在授权范围。

## 项目与基线

- Proposal：prelaunch-canonicalization-and-remediation
- 审查基线：`65c52fb1162b549b2446550b2cda9367c94e9e4f`
- 实施分支：`codex/prelaunch-canonicalization-remediation`
- 环境 destructive gate：PASS（仅 Local/Test/Staging；测试数据可重建）
- Production：NOT_RUN / 明确禁止

## 阶段状态

| 阶段 | 状态 | 实施结果 | 验证 | commit/push |
| --- | --- | --- | --- | --- |
| 00 | 已交付 | 环境、canonical surface、删除清单和最小 seed 已冻结 | PASS | `a1b2a54` / 已推送任务分支 |
| 01 | 已交付 | 公共 Contract/Harness/runtime/旧 URL surface 已收敛；Account 40 ops / Admin 70 ops | PASS（breaking diff 为预期 28 项） | `2ed8d5f` / 已推送任务分支 |
| 02 | 本地已完成 | Commerce 已收敛为 Plan→Offer→Price→Mapping→Checkout；Plan lifecycle、Mapping switch、operation replay、Price/Mapping 并发与 Price retire 已闭环 | PASS | `ab27712` / 本轮补推送 |
| 03 | 本地已完成 | Config / Storage 已收敛为 Config-Version-only ledger；generic file 产品、旧 account quota、legacy storage 分支与 mutable Config cursor 已闭环 | PASS | `ab27712` / 本轮补推送 |
| 04 | 本地已完成 | Account transition 已收敛为严格单入口状态机；Feedback batch delete 使用真实 Admin idempotency，unknown outcome 可安全重放 | PASS | `ab27712` / 本轮补推送 |
| 05 | 本地已完成 | Overview / Commerce Summary 已共享 canonical paid-entitlement helper；Entitlement 与 Billing cursor 均为 opaque immutable boundary；历史 false-positive 已追加 errata，浏览器反例 fixture 可区分旧/新算法 | PASS（`contracts:breaking` 对旧 `origin/main` baseline 的 37 项 breaking 为阶段 07 前预期） | `ab27712` / 本轮补推送 |
| 06 | 本地已完成 | request scope + subtree isolation、服务端 UTF-8 query-bound cursor、实体路由切换 | PASS | 本轮 checkpoint |
| 07 | PARTIAL | forward runtime cleanup 与 Local reuse gate 已验收；fresh reset/schema squash 和整体远端晋升待授权/配置访问 | Local PASS；发布 BLOCKED | 本轮 checkpoint |

## R-01～R-15 关闭记录

已关闭：R-01、R-02、R-03、R-04、R-05、R-06、R-07、R-08、R-09、R-10、R-11、R-12。R-13～R-15 由阶段 06 的真实迟到 Offer response、106 平台分页搜索与实体切换浏览器用例关闭。

## LC-01～LC-13 关闭记录

阶段 02 已关闭 Commerce 域 LC-01、LC-02、LC-03、LC-04、LC-06、LC-07、LC-12；阶段 03 已关闭 Config/Storage 域 LC-05、LC-07、LC-10；LC-08、LC-09、LC-10、LC-11 的公共运行面已由阶段 01 关闭。LC-13 的历史 squash/fresh reset 尚未完成，不以 forward cleanup 或 reuse-local PASS 代替。

## 实际验证记录

| 日期 | 阶段 | 代码版本 | 命令/操作 | 环境 | 退出码 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-13 | 00 | `65c52fb` | `git status --short; git branch --show-current; git rev-parse HEAD; git remote -v; git rev-list --left-right --count HEAD...origin/main` | Local | 0 | PASS：新建任务分支前后均确认基线 `65c52fb`，`origin/main` 0/0；保留既有并发文档改动。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm toolchain:check` | Local | 0 | PASS：Node 24.19.0 / pnpm 11.18.0 / Deno 2.9.6 / Supabase 2.111.0。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm exec supabase --version` | Local | 0 | PASS：Supabase CLI 2.111.0。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm exec supabase migration list --local` | Local Supabase | 0 | PASS：Local migration history 对齐到 `20261012145252`。 |
| 2026-10-13 | 00 | `65c52fb` | Supabase project / migration / Edge read-only inventory | Connected Supabase | 0 | PASS：仅发现 `workendstaging`；migration history 对齐到 `20261012145252`；Edge baseline account-api v63 / billing-webhook v31 / maintenance v39。 |
| 2026-10-13 | 00 | `65c52fb` | OpenAPI/migration baseline counter | Local | 0 | PASS：Account 47 ops v1.2.0；Admin 77 ops v1.0.0；migration files 112。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm docs:check` | Local | 0 | PASS：207 documents，required entries / local links / navigation 一致。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm contracts:check` | Local | 0 | PASS：Account 47 / Admin 77 operations，Consumer Lab snapshot 与 compatibility check 通过。 |
| 2026-10-13 | 00 | `65c52fb` | `git diff --check` | Local | 0 | PASS；仅有既有 CRLF→LF 提示，无 whitespace error。 |
| 2026-10-13 | 00 | `a1b2a54` | `git commit -m "docs: freeze prelaunch remediation baseline"` | Local | 0 | PASS：仅提交本任务 Proposal/审查文档；未暂存既有 `docs/README.md` 与 `project-review-2026-10-13.md`。 |
| 2026-10-13 | 00 | `a1b2a54` | `git push -u origin codex/prelaunch-canonicalization-remediation` | GitHub | 0 | PASS：远端任务分支已建立并跟踪；仓库 workflow 仅在 main push / main PR 触发，不因普通任务分支 push 触发该 workflow。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm test:api` | Local | 0 | PASS：103/103；fixed-product/config-files 测试退出，Checkout/支付/MFA/Global Delete/Config/Feedback 有效场景均改为 canonical surface。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm test:unit` | Local | 0 | PASS：Domain 12、UI 36、Admin 64（14 files），合计 112 tests；Contract operation count 已重基线到 40/70。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm test:consumer-harness` | Local | 0 | PASS：37 canonical operations；dynamic route、workspace isolation、CSRF/origin 与 unsupported-route smoke 全绿。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm contracts:check` | Local | 0 | PASS：Account 40 / Admin 70；OpenAPI refs/sample/binary/no-store、Consumer Lab snapshot、3 contracts / 30 fields consumer manifest 全绿。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm contracts:breaking` | Local vs `origin/main` | 1（预期） | EXPECTED BREAKING：28 项，全部属于已批准删除清单：fixed products、product_code checkout、legacy attribution、generic config-files、account root PATCH、subscription-config 与 Admin config-files。阶段 07 建新 baseline 前保持该预期。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm typecheck` | Local | 0 | PASS：5/5 typecheck tasks。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm lint` | Local | 0 | PASS：344 files，0 warning / 0 error。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm format:check` | Local | 0 | PASS：409 files。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm test:tooling` | Local | 0 | PASS：9/9。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm docs:check` | Local | 0 | PASS：207 documents。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `git diff --check` | Local | 0 | PASS。 |
| 2026-10-13 | 01 | `2ed8d5f` | `git commit -m "feat: remove prelaunch compatibility surfaces"` | Local | 0 | PASS：41 files，345 insertions / 4066 deletions；既有 `docs/README.md` 与 `project-review-2026-10-13.md` 明确排除。 |
| 2026-10-13 | 01 | `2ed8d5f` | `git push` | GitHub | 0 | PASS：远端任务分支已更新到 Phase 01 代码提交。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm db:reset -- --yes` | Local Supabase | 0 | PASS：完整历史从零应用到 `20261013041332_prelaunch_commerce_canonicalization.sql`；一次 Storage health-check 抖动失败后状态恢复并重跑成功，未将基础设施失败伪记为代码 PASS。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm test:db` | Local | 0 | PASS：66 files / 1431 tests；canonical Commerce、历史 Billing/Config/Feedback/Identity 回归全部通过。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm test:api` | Local | 0 | PASS：103/103；Checkout 仅接受 Offer，Admin Plan/Offer/Price/Mapping/Policy 路径与 Entitlement `offer` 投影全绿。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm test:sql:prelaunch-commerce-concurrency` | Local | 0 | PASS：双连接并发 Price versions `[1,2]`、Mapping versions `[1,2]`；two-draft concurrent publish 最终仅一个 active Price，无 raw unique violation。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm test:sql:bill-05-concurrency` | Local | 0 | PASS：两笔并发支付保留 2 条 settlement history，仅 1 个 Grant；决策为 `duplicate_payment` + `granted`。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | runtime `pg_proc` legacy Commerce scan | Local DB | 0 | PASS：`subscription_product_id` / `product_code` / `platform_subscription_config` / `subscription_products` / `legacy_product_code` 命中 0 个 surviving function。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm contracts:check`; `pnpm test:consumer-harness` | Local | 0 | PASS：Account 40 / Admin 72 operations；3 contracts / 30 fields；Consumer Harness canonical operations / route isolation / CSRF smoke 全绿。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm docs:check`; `git diff --check` | Local | 0 | PASS：typecheck 5/5；lint 0 warning / 0 error；410 files format；207 docs；无 whitespace error。 |
| 2026-10-13 | 03 | `a7aa71e+worktree` | `pnpm db:reset -- --yes` | Local Supabase | 0 | PASS：完整历史从零应用到 `20261013080000_prelaunch_config_storage_canonicalization.sql`；Config-Version-only ledger、retired generic file functions 与 Storage Policy rebaseline 可 fresh install。 |
| 2026-10-13 | 03 | `a7aa71e+worktree` | `pnpm test:db` | Local | 0 | PASS：62 files / 1338 tests；新增 t35 19 项覆盖 retired functions/quotas、internal storage capability、函数体无 legacy 分支与 Config cursor mutation-between-pages。 |
| 2026-10-13 | 03 | `a7aa71e+worktree` | `pnpm test:api`; `pnpm test:unit`; `pnpm typecheck` | Local | 0 | PASS：API 103/103；Unit Domain 12 + UI 36 + Admin 64 = 112；typecheck 5/5。 |
| 2026-10-13 | 03 | `a7aa71e+worktree` | `pnpm contracts:check`; `pnpm test:consumer-harness`; `pnpm lint`; `pnpm format:check`; `pnpm docs:check`; `git diff --check` | Local | 0 | PASS：Account 40 / Admin 72 operations；Consumer Harness 全绿；Lint/Format/Docs/whitespace 全绿。 |
| 2026-10-13 | 04 | `a7aa71e+worktree` | `pnpm db:reset -- --yes` | Local Supabase | 0 | PASS：完整历史从零应用到 `20261013103000_prelaunch_governance_idempotency.sql`；旧 4 参数 / v2 Account transition 可安全退休。 |
| 2026-10-13 | 04 | `a7aa71e+worktree` | `pnpm test:db` | Local | 0 | PASS：62 files / 1349 tests；非法/no-op Account transition 为 0 event + 0 success audit；Feedback same-operation replay 不重复 row_version/delete_requested/audit，hash 冲突 fail closed。 |
| 2026-10-13 | 04 | `a7aa71e+worktree` | `pnpm test:api`; `pnpm test:unit`; `pnpm typecheck` | Local | 0 | PASS：API 107/107；Unit Domain 12 + UI 36 + Admin 67 = 115；typecheck 5/5。 |
| 2026-10-13 | 04 | `a7aa71e+worktree` | retired transition/runtime scan; `pnpm contracts:check`; `pnpm test:consumer-harness`; `pnpm lint`; `pnpm format:check`; `pnpm docs:check`; `git diff --check` | Local | 0 | PASS：生产 runtime/UI 对 `admin_account_transition_v2` 0 命中，旧入口仅保留“不存在”断言；Account 40 / Admin 72 contracts、Consumer Harness、Lint/Format/Docs/whitespace 全绿。 |
| 2026-10-13 | 05 | `a7aa71e+worktree` | `pnpm db:reset -- --yes`; `pnpm test:db` | Local Supabase | 0 | PASS：完整历史应用到 `20261013120000_prelaunch_read_model_pagination_qa.sql`；62 files / 1354 DB tests。Overview 与 Commerce Summary 共享 `commerce_active_paid_entitlements`；Entitlement mutation-between-pages 与 immutable account cursor 回归通过。 |
| 2026-10-13 | 05 | `a7aa71e+worktree` | `pnpm test:api`; `pnpm typecheck`; `pnpm format:check` | Local | 0 | PASS：API 107/107；Commerce Entitlement opaque cursor 解码后把 `account_created_at + account_id` 传回 SQL；typecheck 5/5；410 files format。 |
| 2026-10-13 | 05 | `a7aa71e+worktree` | `pnpm verify:task:0801 --reuse-local` | Local | 1（预期 gate） | 前置 format/lint/typecheck/build/unit/tooling/API 107/DB 1354/settlement concurrency 全部 PASS；随后 `contracts:breaking` 对 `origin/main` 报 37 项已批准 prelaunch breaking，因此按设计在阶段 07 rebaseline 前停止，未伪记为产品失败。 |
| 2026-10-13 | 05 | `a7aa71e+worktree` | standalone Local T12 browser flow | Local | 0 | PASS：fixture 先证明 retired subscription-only paid count=2、canonical helper=1，再由浏览器断言 Overview 与 Commerce Summary 一致；`commerceSummarySurfaces` PASS，architecture behavior 全绿，5 viewports × 20 routes = 100 responsive/a11y observations PASS。 |

工具记录：首次组合 Git 诊断使用 `&&` 被当前 Windows PowerShell 解析拒绝（退出码 1），未修改文件；改用 PowerShell 兼容分隔符后 PASS。`supabase status -o json` 仅用于确认 Local 服务存在，命令输出包含本地开发用 key/secret，因此这些值不写入验证记录或任务报告。

## GitHub / Staging

未开始。不得预填成功记录。

## 2026-10-14 继续实施与审查

- 起始 HEAD：ab27712；沿用任务分支，已有 Phase 06 代码和三份审查报告均保留，用户本轮要求包含全部项目修改提交。整次 R3，消费者为 SQL → Account/Admin Edge → OpenAPI → Admin BFF/UI、Harness/Registry；不新增 Provider/费用或真实支付。
- 文档先同步：移除当前 architecture/reference 中 fixed products、product_code Checkout、generic file 产品说明，历史审查/Proposal 保留历史意义。
- 失败反例：API 摘要字段边界与 Auth 删除 transient retry 两项先 FAIL，修复后 109/109 PASS；中文/emoji 搜索曾 503，UTF-8 cursor 修复后 200；失败兑换回滚导致计数 1（应为 2），修复后真实 Harness PASS。
- 清理：删除无调用者的 admin_account_list_v2、admin_platform_key_list_v2；Billing v2 read 仍是 v3 的内部 helper，收回所有 executor 直接 execute。旧有 t16 fixture 同批迁往 canonical v3，未删除失败行为断言。
- 兑换限流遵循已记录的账户 5/min、平台 300/min；拒绝与同意图重放在 SQL 唯一写入口持久化，API 提交拒绝后再返回错误。原文档的 IP 限流没有可信 IP 传播合同，改为明确未实现，禁止相信客户端转发头。

| 检查 | 实际命令/范围 | 结果 |
| --- | --- | --- |
| 工具链/静态/构建/单元 | pnpm verify:task:0801 --reuse-local；CONTRACT_BASE_REF=HEAD（ab27712，批准 breaking 后的候选合同） | PASS：21 executable gates；Node/pnpm/Deno/Supabase 固定版本、format/lint/typecheck/build、118 unit、9 tooling |
| SQL/权限/非法状态/幂等/分页 | pnpm test:db，候选包含 20261013180004 | PASS：62 files / 1357 tests |
| 真并发 | settlement 与 prelaunch Commerce 双连接脚本，runner 自动 Local env | PASS：2 settlements / 1 Grant；Price/Mapping versions [1,2]，concurrent publish 仅一个 active Price |
| Edge/API/Provider Mock | pnpm test:api | PASS：109/109 |
| Consumer 真 HTTP | pnpm test:e2e:consumer-harness（最新单独复验） | PASS：Auth/CSRF/隔离、Offer/兑换、失败计数/replay/账户及平台 429、Config/Feedback、logout/invalid refresh |
| Admin 浏览器 | pnpm test:e2e:t12-r2（总 runner） | PASS：A 慢/B 快的实际页面请求 race、106 平台搜索/分页、实体 ID 退出、MFA/治理；5 viewports × 20 routes=100 responsive/a11y observations |
| 合同/Registry/运行时 | contracts:check、test:registry、test:consumer-harness、runtime:probe | PASS：Account 40 / Admin 72 ops；3 contracts / 30 fields；独立 Consumer、Node/Deno 导入 |
| 当前 main breaking 差异 | pnpm contracts:breaking（origin/main@65c52fb） | FAIL：37 项已批准 prelaunch breaking；新起点比较仍保持严格 gate，不把此结果写 PASS |
| 文档/差异/敏感扫描 | docs:check、git diff --check；新增行 private-key/provider-credential pattern 扫描 | PASS：209 docs；无 whitespace；0 真实凭据候选（非全面 Secret scanner） |
| Local advisor | supabase db advisors --local --type security --level error --fail-on error | PASS：0 error |
| fresh reset/squash | Local/Test/Staging | BLOCKED：本轮重置问题尚无答复；不得复用昨日授权静默重置 |
| 远端整体 schema/Account/Webhook | workendstaging / egsokuicabbxspkdccqe | BLOCKED：6 retired mappings、8 retired checkouts 不满足 canonical NOT NULL；重置或另行明确数据处理决定前不部署不兼容 runtime |
| main/自动 Admin 发布 | GitHub main → Vercel aisenhubplatform-admin | BLOCKED：连接器 403；现有 CLI scope-not-accessible，无法核对配置；不绕过 G2、也不先合并触发部署 |
| 远端 security advisor | workendstaging 只读 | PARTIAL：无 error；pg_net in public、leaked-password-protection disabled 两项 WARN，未作费用/环境配置变更 |

最初并发脚本缺 Local env（FAIL）后由总 runner 注入后 PASS；首次总 gate 格式失败修正后 PASS；一次重复 Harness 与总 runner 重叠导致端口占用/401（FAIL），待总 runner 退出串行重跑后 PASS。失败证据保留于 E:/AppData/Codex/prelaunch，不用基础设施失败冒充产品通过。

原三个历史静态审查报告中的结论须按当前源码复核：Promise.race 为参与 promise 安装拒绝处理器，不单因 race 失败推断 unhandled rejection；现有 upload releaseLock 防护已有回归。Config create 先锁账户再查 slot；旧建议不构成目前并发漏洞证据。单例 Admin 离线恢复已经存在，不增加第二套管理员模型。

G0/G1：候选范围与适用 Local reuse 检查 PASS；G2/G3：整体发布 BLOCKED，目标数据和自动 Admin 配置未通过；G4：禁止回到 retired runtime，forward-fix 保留账本，测试环境 reset 必须有授权；G5：本轮明确授权代码/Git 合并与 Supabase 更新，不自动等于数据库数据重置；G6：整体未部署 NOT_RUN，真实 Provider/Production 交易观察 NOT_RUN。

### 候选基线与独立 Maintenance 更新

- Phase 06 / audit source checkpoint：`b7de3ef`；`pnpm contracts:breaking b7de3ef` PASS，新 canonical 起点为此提交的 Account/Admin OpenAPI；默认对旧 origin/main 的 37 项差异仍 FAIL，不放宽比较器。
- 提交前检查曾发现新增 SQL 文件尾空行（先前 git diff 不包含 untracked 文件）；随后扫描完整 origin/main 差异发现 Phase 03 同类尾空行，均仅移除 EOF 空白，最终 `git diff origin/main --check` PASS。两份均未应用远端，未重写已部署迁移语义。
- 完整差异重新执行 private-key/provider-credential pattern 扫描，0 命中；不宣称全面 Secret scanner。
- 独立发布范围：只有 Maintenance，bundle 来源 b7de3ef；Auth 删除 404 幂等成功与 transient retry 修复，不依赖本 Proposal 新 schema，不改 Secret、Provider mapping 或数据。G0/G1 针对此 bundle PASS；G2 已确认 linked ref = workendstaging，角色、capability 路由不变；G3 无新迁移/数据写入；G4 保持失败 checkpoint，可停止 identity capability 外部调用并 forward-fix，禁止恢复已知死锁代码；G5 用户本轮明确要求涉及 Supabase 及时部署。
- `pnpm exec supabase functions deploy maintenance --project-ref egsokuicabbxspkdccqe --use-api`：PASS，已核对 ACTIVE v40 / verify_jwt=false；ezbr SHA256 `888dc58eebd3bc334123a66a7aef16da64bafb7f94126e480a6c497b0793d43b`。Account API 仍 v63，Webhook 仍 v31。
- G6 只读/拒绝式 probe：正确 Hosted URL 的 anonymous 和 invalid capability 均 401 PASS，未调用真实删除任务。首次 probe 重复 maintenance 路由前缀得到 404 FAIL，按已核实路由纠正后 401，不把错误 URL 解释为产品缺陷。两个实际任务周期和真实删除恢复观察 NOT_RUN。
- 最新单独 Harness 复验包含账户 5/min、平台 300/min、失败计数、拒绝 replay 和超限后的成功 replay，PASS；窗口 fixture 同时填充相邻分钟，避免 wall-clock 边界造成假失败。测试计数 hash 按本次合成平台范围清理。

整体 schema/reset、Account/Webhook 更新、main 合并与分支删除仍 BLOCKED；不以独立 worker 发布充当全项目上线完成。
