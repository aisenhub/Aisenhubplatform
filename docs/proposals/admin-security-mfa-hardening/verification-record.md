# Admin 安全管理与 MFA 整改实施与验证记录

本文件由实施 Agent 在任务收尾、失败、阻塞和交接时更新；只记录真实执行结果。

## 项目与基线

- 优化目标：统一 Admin 安全状态、补齐 MFA 生命周期并恢复审计可信度
- GitHub 仓库：`https://github.com/aisenhub/Aisenhubplatform.git`
- 工作分支：`codex/fix-admin-session-delete-jobs`（已有分支，含其他任务改动；本轮不混入提交）
- 起始 commit：`bf142bb51f2e62ad3ba964e2199d01955dd7bd10`（审查基线，执行时重核 HEAD）
- 初始工作区状态：`docs/README.md`、`docs/proposals/README.md` 已修改，提案目录及专项审查报告未跟踪；均在本轮开始前存在
- 运行环境：Windows 本地；Supabase CLI 2.111.0；复用已安装的 Docker Desktop，Linux Engine 与本地 Supabase Auth/DB 已启动
- 已知环境限制：本地 REST gateway 返回 503，Storage/Studio 健康检查未通过；Auth health 返回 200。具体影响须按测试入口区分

## 任务状态总表

| 任务 | 名称 | 状态 | 已完成 | 剩余/依赖 | commit | push/GitHub |
| --- | --- | --- | --- | --- | --- | --- |
| `SEC-PROBE-00` | 固定版本 Auth 行为探针 | 进行中 | 本地首绑/再绑、备用与最后因子删除、双会话竞争、AAL refresh、Auth audit 表探针通过 | 实际 status HTTP 尚无路由；Auth audit 保留期及 Admin 身份矩阵待核对 | 未提交 | 未推送 |
| `SEC-ADMIN-01` | 统一错误分类 | 进行中 | Local 检查完成：共享错误语义、近期 MFA 触发条件及浏览器身份/失败恢复矩阵通过 | R3 CI 与隔离 Git 交付待处理；当前分支包含无关历史和既有未提交文件 | 未提交 | 未推送 |
| `SEC-ADMIN-02` | 权威状态与 Shell Gate | 进行中 | Local 与 Local Supabase 验证完成：40 API 单测、17 Admin 单测、7 SQL 角色/session 断言、status/Shell 浏览器身份矩阵及 70 组布局检查通过 | R3 CI 未运行；隔离提交与 Git 交付待处理，当前 worktree 含其他既有修改 | 未提交 | 未推送 |
| `SEC-TRACE-03` | 规范 request ID | 未开始 | 未验证 | 无 | 未验证 | 未验证 |
| `SEC-ACTION-04` | 确认事实与原因链路 | 未开始 | 未验证 | `SEC-TRACE-03` | 未验证 | 未验证 |
| `SEC-STEPUP-05` | Factor 证据与 Step-up 合同 | 未开始 | 未验证 | `SEC-TRACE-03` | 未验证 | 未验证 |
| `SEC-MFA-06` | MFA 因子生命周期 | 未开始 | 未验证 | `SEC-PROBE-00`、`SEC-ADMIN-02`、`SEC-STEPUP-05` | 未验证 | 未验证 |
| `SEC-AUDIT-07` | 可调查审计 | 未开始 | 未验证 | `SEC-ACTION-04`、`SEC-MFA-06` | 未验证 | 未验证 |
| `SEC-WEB-08` | Admin 浏览器加固 | 未开始 | 未验证 | 无；总体验收与 MFA 汇合 | 未验证 | 未验证 |
| `SEC-VERIFY-09` | 全链路验收 | 未开始 | 未验证 | 以上全部 | 未验证 | 未验证 |

状态只能使用：未开始、进行中、已阻塞、验证失败、验收通过待推送、已交付。已交付要求实现完成、必要验收通过、提交已 push 且远端 SHA 已核对。

## 单任务实施记录模板

### `[任务 ID]`：[任务名称]

- 起始 HEAD / 最终 HEAD：未验证
- 分支：未验证
- 风险分级及理由：未验证
- 实际修改文件及职责：未验证
- 已实现行为：未验证
- 合同、迁移与消费者同步：未验证
- 与计划的偏差、原因和影响：无 / 未验证
- 新增依赖及必要性：无 / 未验证
- 未完成或未验证内容：未验证
- 回退方式：未验证

### `SEC-ADMIN-02`：服务端权威安全状态与 Admin Shell Gate

- 起始 HEAD / 最终 HEAD：`bf142bb51f2e62ad3ba964e2199d01955dd7bd10` / `bf142bb51f2e62ad3ba964e2199d01955dd7bd10`（仅工作区修改，未提交）
- 分支：`codex/fix-admin-session-delete-jobs`；分支已有其他任务提交，工作区亦含本任务外改动。
- 风险分级及理由：R3；新增 Admin OpenAPI、BFF、Account API、SQL 授权函数与跨页面 Shell Gate。
- 受影响消费者：Admin Shell/MFA/业务路由、Admin BFF、Account API、Supabase Auth Session、Admin OpenAPI 与架构/reference 文档。
- 实际修改文件及职责：`supabase/migrations/20260926104028_admin_security_status.sql` 添加最小只读 status SQL；`supabase/tests/sec_admin_02_security_status.sql` 验证执行角色与函数边界；`supabase/functions/account-api/admin.ts` 调用并返回合同；`apps/admin/app/api/v1/[...path]/route.ts` allowlist；`apps/admin/components/shell/admin-shell.tsx` status-first gate；`apps/admin/features/security/admin-security-status.ts` 状态分类；`apps/admin/app/api/auth/refresh/route.ts` 无 refresh token 时稳定返回 401；相关 API/Admin/E2E 测试、OpenAPI、reference、architecture 与 proposal 验证文档同步。
- 已实现行为：status 在全局 AAL2 gate 前检查已验证用户、活动 session 和 singleton 管理员；管理员 AAL1/AAL2 返回当前 AAL 和当前 session 有效 proof expiry；匿名 401、非管理员 403 `ADMIN_REQUIRED`、服务不可用 503。Shell 在 status 完成前不渲染普通管理内容，AAL1 管理员进入 MFA，AAL2 继续，非管理员阻断，未登录进入登录页，服务故障可重试且 fail closed。
- 合同、迁移与消费者同步：新增 `GET /admin/api/v1/security/status`；Admin OpenAPI 为 45 operations；CLI 生成迁移 `20260926104028` 已在 Local 前向应用；Admin BFF 只增加 allowlist、不复制授权算法。
- 与计划的偏差、原因和影响：补充 Admin refresh route 的 missing-refresh 401 语义。登出会清除 CSRF 与 refresh cookies；原 refresh handler 先因无 CSRF 返回 403，导致会话管理器把已明确的无会话误判为授权服务不可用。先判定缺少 refresh token 后返回无副作用 401，修复 Shell 登录跳转，不改变有效 refresh 的 CSRF 检查。
- 新增依赖及必要性：无。
- 未完成或未验证内容：CI 与 GitHub 检查未运行；因现有分支/worktree 包含其他任务与用户既有修改，未提交/推送；未执行生产迁移、部署或生产管理员操作。Local Supabase 已验证。
- 回退方式：先回退 Shell 消费并保持状态 API 兼容；之后移除 BFF allowlist/API 路由。新增 SQL 函数为只读、无数据迁移，可在消费者撤回后另行安排受控删除。

## 验证记录

| 日期 | 任务 | 代码版本 | 命令/操作 | 环境 | 退出码 | 结果 | 脱敏证据/备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-26 | `SEC-PROBE-00` | `bf142bb` + 未提交提案 | `pnpm exec supabase --version` | Local | 0 | PASS | 固定 CLI 2.111.0；不代表 Auth 行为通过 |
| 2026-09-26 | `SEC-PROBE-00` | `bf142bb` + 未提交提案 | `pnpm toolchain:check` | Local | 0 | PASS | Node 24.19.0、pnpm 11.18.0、Deno 2.9.6、Supabase 2.111.0 |
| 2026-09-26 | `SEC-PROBE-00` | `bf142bb` + 未提交提案 | `docker info --format '{{.ServerVersion}}'` | Local | 1 | BLOCKED | Docker Desktop Linux Engine pipe 不存在；`Start-Service com.docker.service` 亦因服务访问失败（退出 1） |
| 2026-09-26 | `SEC-PROBE-00` | `bf142bb` + 未提交提案 | 两独立会话首绑/再绑/删除竞争/原生 unenroll/AAL 刷新/Auth audit/实际 status HTTP | Local Supabase | 未运行 | BLOCKED | Docker 不可用；当前代码与 OpenAPI 尚无 security status 路由；不得用静态推断代替 |
| 2026-09-26 | `SEC-PROBE-00` | `bf142bb` + 未提交提案 | 阅读 `tooling/scripts/src/api-tests.mjs` 与固定版本声明 | Local 静态 | 不适用 | PASS | `pnpm test:api` 运行 Deno 单测，不是实际 HTTP；官方 Auth audit 数据库表为可选来源 |
| 2026-09-26 | `SEC-PROBE-00` | `bf142bb` + 未提交探针 | 启动已安装的 Docker Desktop；`pnpm db:start`；Auth health | Local Supabase | 0/0/HTTP 200 | PASS | Docker Engine 29.7.2；本地 Auth/DB 可用；未触碰生产 |
| 2026-09-26 | `SEC-PROBE-00` | `bf142bb` + 未提交探针 | `node tests/spikes/api/sec-probe-00-mfa.mjs` | Local Supabase | 0 | PASS | 合成用户首绑和再绑成功；备用因子删除后 AAL2；原生最后因子删除成功，剩余 0；refresh 前 AAL2、后 AAL1；两独立会话各自删除均成功，最终 0；`auth.audit_log_entries` 存在且探针期间新增 31 行（不据此断定逐行归属） |
| 2026-09-26 | `SEC-PROBE-00` | `bf142bb` + 未提交探针 | `node --check tests/spikes/api/sec-probe-00-mfa.mjs` | Local | 0 | PASS | 探针语法通过；合成用户在 finally 中清理，Auth audit 历史保留 |
| 2026-09-26 | `SEC-PROBE-00` | `bf142bb` + 未提交提案 | security status 实际 HTTP | Local Supabase | 未运行 | NOT_RUN | 当前实现与 OpenAPI 均无该路由，作为 `SEC-ADMIN-02` 的明确基线缺口；不可记 PASS |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码 | `pnpm --filter admin test:unit` | Local | 0 | PASS | 3 文件、14 用例，包括共享错误码分类；不代表浏览器矩阵 |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码 | `pnpm --filter admin typecheck`（首次） | Local | 1 | FAIL | `AuditPayload.request_id` 可为 null；已修复并复测 |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码 | `pnpm --filter admin typecheck`（复测） | Local | 0 | PASS | TypeScript 无错误 |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码 | `pnpm format:check`、`pnpm lint`（首次） | Local | 1/1 | FAIL | 格式与未使用变量；已修复并复测 |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码 | `pnpm format:check`、`pnpm lint`（复测） | Local | 0/0 | PASS | 格式和静态规则通过 |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码 | `pnpm --filter admin build` | Local | 0 | PASS | Next.js 16.3.0 生产构建、TypeScript 和 15 个静态页面生成完成；未验证运行时身份链路 |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码 | `pnpm test:e2e:t12-r2`（首次） | Local browser + Supabase | 1 | BLOCKED | Admin dev 冷编译超过测试固定 10 秒导航超时；尚未进入身份断言，预热页面后重跑 |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码 | `pnpm test:e2e:t12-r2`（第二、三次） | Local browser + Supabase | 1/1 | FAIL | 已通过登录、AAL1 拒绝、MFA verify；旧测试断言仍查找已改名的“管理员总览”，改为精确定位“概览”标题 |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码及测试 | `pnpm test:e2e:t12-r2`（初次复测） | Local browser + Supabase | 1 | FAIL | 过期 proof 已正确返回 `RECENT_MFA_REQUIRED`，recent MFA 验证返回 200；测试误等已卸载的面板状态，改为断言可见“已验证”状态 |
| 2026-09-26 | `SEC-ADMIN-01` | `bf142bb` + 未提交代码及测试 | `pnpm test:e2e:t12-r2`（身份负例复测） | Local browser + Supabase | 0 | PASS | 登录、AAL1 `MFA_REQUIRED`、recent proof 到期后 MFA 和显式重提（无自动重放）、AAL2 非管理员 `ADMIN_REQUIRED`、模拟上游 503 后显示可恢复错误且保留会话、重试 200、MFA 后敏感写入和登出后旧 JWT 拒绝；70 个页面/视口组合、焦点和语义检查通过 |
| 2026-09-26 | `SEC-ADMIN-01` / 文档 | `bf142bb` + 未提交代码及提案 | `pnpm --filter admin test:unit`、`pnpm --filter admin typecheck`、`pnpm docs:check`、`pnpm contracts:check`、`pnpm format:check`、`pnpm lint`（本地环境就绪后复测） | Local | 0/0/0/0/0/0 | PASS | 14 单测、89 文档、44 Admin operations；不替代剩余浏览器身份负例 |
| 2026-09-26 | `SEC-PROBE-00` / `SEC-ADMIN-01` | `bf142bb` + 未提交测试 | 本地 SQL 清理核对；Auth health；`git diff --check` | Local Supabase / Local | 0/HTTP 200/0 | PASS | `sec-probe-00-*` 与 `t12-r2-browser-*` 合成用户均剩余 0，管理员记录无悬挂引用；Auth 保持运行，临时 Admin/Account API 服务已停止 |
| 2026-09-26 | 文档修订 | `bf142bb` + 未提交提案 | `pnpm docs:check`、`pnpm contracts:check`、`git diff --check` | Local | 0/0/0 | PASS | 89 文档链接与 44 Admin operations 结构检查通过；现有合同检查尚不验证 Step-up 策略 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区迁移 | `pnpm exec supabase migration list --local`、`pnpm exec supabase migration up --local` | Local Supabase | 0/0 | PASS | 核对两条待应用前向迁移；应用既有 `20260921084727` 与本任务 `20260926104028`，未执行 `db:reset` 或访问生产 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区代码 | `pnpm --filter admin test:unit`、`pnpm --filter admin typecheck` | Local | 0/0 | PASS | 17 Admin 单测通过；TypeScript 无错误 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区代码 | `pnpm exec deno test --allow-env supabase/functions/account-api/index.test.ts` | Local | 0 | PASS | 40 API 测试通过；含 AAL1 管理员、非管理员、session 撤销与 malformed SQL fail-closed |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区迁移/SQL tests | `pnpm exec supabase test db --local supabase/tests/sec_admin_02_security_status.sql` | Local Supabase | 0 | PASS | 7 pgTAP 断言；以 `SET LOCAL ROLE admin_executor` 实测执行权限、非管理员拒绝、AAL1 活动状态返回与撤销 session 拒绝；其他 runtime 无 EXECUTE |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区代码/合同 | `pnpm contracts:check` | Local | 0 | PASS | Admin OpenAPI 45 operations、producer/consumer schemas 检查通过 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区文档 | `pnpm docs:check` | Local | 0 | PASS | 89 文档、必需索引和本地链接一致 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区代码/文档 | `pnpm format:check`、`pnpm lint` | Local | 0/0 | PASS | 391 文件格式检查与 oxlint 通过 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 初版 API/Shell | `pnpm test:e2e:t12-r2`（迭代验证） | Local browser + Supabase | 1 | FAIL | 复用的旧 Account API 进程返回 `MFA_REQUIRED` 403；更换为加载当前源码的 Local 进程后发现 Admin context composite cast 问题，修为 `row(...)::private.admin_context` |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + Shell/auth 迭代 | `pnpm test:e2e:t12-r2`（匿名边界迭代） | Local browser + Supabase | 1 | FAIL | 登出后 status 返回 401，但 refresh route 在缺少 refresh token 时先因 CSRF 缺失返回 403；调整为先识别无 refresh token 并返回 401，保留有 token 时 Origin/CSRF 校验 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + Admin dev 当前源码 | `pnpm test:e2e:t12-r2`（冷编译尝试） | Local browser | 1 | BLOCKED | Next dev 首次编译超过测试固定 10 秒导航阈值；预热页面后继续验证，最终运行通过 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 当前代码 | `POST /api/auth/refresh`（无 session、无 CSRF） | Local browser + Supabase | HTTP 401 | PASS | 缺少 refresh token 时返回 UNAUTHORIZED；有效 refresh 路径仍受 Origin/CSRF 保护 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 最终工作区代码 | `pnpm test:e2e:t12-r2` | Local browser + Supabase | 0 | PASS | AAL1/AAL2 status、MFA、非管理员 status/API/Shell 阻断、status 503 fail-closed 与重试、过期 proof 和显式重提、敏感写入、登出后旧 JWT 拒绝及匿名 Shell 重定向通过；70 个路由/视口检查通过 |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区当前代码 | CI 检查 | CI | 不适用 | NOT_RUN | 尚未形成隔离提交/推送；本地 R3 检查不冒充远端 CI |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区当前代码 | 外部 Provider 验证 | Provider | 不适用 | NOT_RUN | 本任务未修改外部 Auth Provider 或支付 Provider 配置；只验证 Local Supabase Auth |
| 2026-09-26 | `SEC-ADMIN-02` | `bf142bb` + 工作区当前代码 | 生产迁移/部署/观察 | Production | 不适用 | NOT_RUN | 本任务未获生产操作授权，未连接或修改生产环境 |

结果只使用：PASS、FAIL、NOT_RUN、PARTIAL、BLOCKED。记录真实命令、环境、退出码和可观察断言；代码变化后重新判断旧结果是否仍覆盖当前版本。

## GitHub 交付记录

| 任务 | commit SHA | 分支 | push | 远端核对 | main/生产状态 |
| --- | --- | --- | --- | --- | --- |
| `SEC-ADMIN-01` | 未提交 | `codex/fix-admin-session-delete-jobs` | 否 | 未核对 | main/生产未操作；worktree 有其他修改，CI 未运行 |
| `SEC-ADMIN-02` | 未提交 | `codex/fix-admin-session-delete-jobs` | 否 | 未核对 | main/生产未操作；worktree 有其他修改，CI 未运行 |

## 交接信息

- 下一任务：计划中下一个独立任务为 `SEC-TRACE-03` 规范 request ID；`SEC-ADMIN-01`、`SEC-ADMIN-02` 的 Git 交付仍待隔离工作区和 R3 CI 检查
- 必须先解决的问题：`SEC-MFA-06` 删除入口发布前需决定接受仅应用级保护，或另行设计并验证覆盖原生入口的全局策略；本地已证明原生 API 与双会话均能删至零
- 可直接复用的合同和能力：Supabase 2.111.0 的 Auth MFA API、现有 factor `friendly_name`、Admin 共享错误工具、`callbackReturnTo` 安全路径校验
- 不应重复实施的工作：本轮已将共享错误语义和所有已检索到的 Admin mutation 近期 MFA 触发条件统一
- 当前未提交修改及归属：本整改涉及的提案、Auth 探针、Admin status/Shell/API/OpenAPI/迁移及测试均未提交；`docs/README.md`、`docs/proposals/README.md`、`docs/reviews/admin-security-mfa-review-2026-09-21.md` 和其他 Admin 页面改动在任务开始时已存在，本轮保留且未暂存。当前分支另含未合并的管理员 session/删除任务提交，未混入本任务提交
- 需要用户决定的事项：删除因子的产品承诺与风险取舍；这不阻塞独立的 Admin 错误分类和权威状态工作
