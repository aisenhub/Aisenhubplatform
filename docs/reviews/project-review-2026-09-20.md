# Aisenhubplatform 项目审查报告

审查日期：2026-09-20  
审查基线：`f1341ae`（`codex/platform-onboarding-handbook`）  
范围：架构、依赖与配置、安全性、类型与代码质量、测试、CI/CD、可维护性、文档与仓库卫生。

## 总体结论

项目的核心架构方向合理，关键安全边界也比较完整：浏览器不直接持有数据库或 Storage 写凭据；Consumer/Admin 通过同源 BFF 进入中央 API；JWT 除了解析 claims 之外还执行签名/主体验证；Account/Admin/Maintenance 使用分离的数据库 executor role；业务状态写入集中到 PostgreSQL `private` 领域函数；Billing webhook 具备验签、hash-only Inbox、processing job 与 lease/fence；文件上传采用有界读取和可恢复状态机；OpenAPI 与 consumer contract 有自动一致性检查。

本轮没有发现足以直接判定为严重认证绕过的明显漏洞。优先改进方向主要是工程门槛失真、测试入口不闭合、运行时超时、高权限维护凭据的爆炸半径，以及长期可维护性。

## P1：优先处理

### 1. CI 的格式门槛没有覆盖整个仓库

审查时执行 `pnpm run healthcheck` 失败，`oxfmt --check` 在约 370 个文件中报告 58 个文件存在格式差异。但 CI 的 `verify:task:0801` 只对 `task-0801.mjs` 中手工维护的少量 `formatTargets` 执行格式检查，因此存在 CI 绿色而全仓 healthcheck 红色的可能。

建议：CI 明确执行全仓 `pnpm run format:check`；`task-0801` 也使用同一个全仓入口，不维护第二份固定文件列表。

### 2. `pnpm test:unit` 不是闭合的绿色入口

审查时 `pnpm run test:unit` 失败，原因是 `apps/template-preview` 配置了 `vitest run`，但没有测试文件。其他已执行 workspace 单元测试正常通过。

建议：为 Consumer BFF 增加真实单元测试，至少覆盖 allowlist、public read、session gate、Origin/CSRF、敏感请求头转发与隔离，而不是通过 `--passWithNoTests` 放宽门槛。

### 3. Maintenance 单一 Bearer Token 的权限跨度过大

`MAINTENANCE_JOB_TOKEN` 可以进入文件清理、reconcile、删除任务、Auth 删除、Billing job/reconciliation 和 account retention 等多类高影响入口。数据库角色隔离降低了部分风险，但单个网络凭据泄漏后的 blast radius 仍较大。

建议后续拆分为文件、Billing、Identity 等 capability，进一步可使用带 `aud + scope + exp + job_id` 的短期内部凭证。

### 4. Account API 与 BFF 缺少统一的上游请求超时

`packages/account-server` 已有 `AbortController` deadline，但 Account API 的 JWKS/Auth fallback，以及 Admin/Consumer BFF 到中央 API 的部分 fetch 未形成统一 timeout 约束。

建议提供统一 `fetchWithDeadline()`，按 Auth、Account API、Storage、Provider 分别配置边界，并统一 timeout/network 错误映射。

## P2：中期整改

### 5. 工具链版本声明不一致

当前同时存在 `package.json` 的 Node/pnpm 约束、CI 的固定 Node/pnpm、`.nvmrc` 的 `lts/*`，以及 `requirements.mjs` 中更旧的 Node/pnpm 最低版本和 Makerkit 提示文本。

建议统一 Node、pnpm、Deno、Supabase CLI 的明确基线；若支持多个 Node 版本，应使用显式 matrix，而不是漂移的 `lts/*`。

### 6. 供应链可复现性可以加强

审查时 CI 使用 `pnpm install` 而不是 `pnpm install --frozen-lockfile`，Deno 配置也关闭了 lockfile。

建议 CI 使用 frozen lockfile，并评估启用 Deno lockfile；后续增加 dependency review、secret scan、CodeQL 等独立供应链/安全检查。

### 7. Windows SDK 打包触发 Node `DEP0190`

`tooling/scripts/src/sdk-pack.mjs` 在 Windows 上以 `shell: true` 配合参数调用子进程，审查时 typecheck/build 均出现 Node 的 `DEP0190` 安全弃用警告。

建议后续去掉 `shell: true`，改用安全的可执行入口或统一 launcher。

### 8. 核心 Edge 文件体积过大

审查时 `supabase/functions/account-api/index.ts` 约 2963 行，`supabase/functions/maintenance/index.ts` 约 1522 行。

建议只拆 TypeScript orchestration 层，例如 auth/router/account/admin/billing/files/errors/database 等模块；不要把 PostgreSQL `private` 领域规则重新搬回 TS。

### 9. Admin BFF 应建立显式浏览器 allowlist

Consumer BFF 已显式列出允许的路由，而 Admin BFF 更接近通用 path proxy。中央 API 仍有权限检查，因此不是直接授权漏洞，但未来新增 Admin endpoint 可能自动变成浏览器可达。

建议建立显式 route capability map，最好由 Admin OpenAPI 生成或校验。

### 10. `test:api` 标准入口与真实 Edge 测试分裂

审查时根 `test:api` 是占位脚本，而 CI 的 `task-0801` 实际内联执行 4 组 Deno 测试。实际核心 Edge 套件运行结果为 74 passed / 0 failed。

建议将 `pnpm test:api` 变为真实聚合入口，`task-0801` 只调用这个标准入口。

### 11. 根脚本存在 Windows 绝对 Deno 路径

部分根脚本写死 `D:\\APP\\Codex\\Deno\\bin\\deno.exe`，跨平台性不足。

建议后续统一使用 `DENO_BIN`，否则从 PATH 解析 Deno。

### 12. Checkout URL 在生产配置应强制 HTTPS

Afdian checkout base URL 当前允许 `http:` 与 `https:`。Local/test 使用 HTTP 合理，但 staging/production 应明确强制 HTTPS，并在启动/配置阶段尽早失败。

## P3：清理与长期质量

### 13. 架构审查生成物应与源码入口分离

仓库根目录存在 architecture review HTML、PNG、visual-check 等生成物，并参与 formatter 扫描。

建议保留可版本化的架构源定义，把生成 HTML/PNG 放入 `artifacts/`、CI artifact 或明确的 generated 目录。

### 14. 明确 CSP 与安全响应头的责任边界

仓库 Next config 中未发现统一 CSP。线上也可能由 CDN/WAF/反向代理负责，因此不能据此判定缺失，但应明确 CSP、HSTS、`frame-ancestors`、Referrer-Policy、Permissions-Policy 等安全 header 的 owner。

### 15. 清理 Makerkit 模板遗留命名

`package.json`、`requirements.mjs` 等仍有 Makerkit 品牌和旧版本要求。建议做一次 repository identity cleanup，减少后续维护者判断“模板遗留还是当前规范”的认知成本。

## 审查时的实际验证结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm healthcheck` | FAIL | 58 个文件格式不一致 |
| `pnpm lint` | PASS | 307 files，0 warnings / 0 errors |
| `pnpm typecheck` | PASS | 9 tasks successful |
| `pnpm test:unit` | FAIL | `template-preview` 无测试文件 |
| `pnpm docs:check` | PASS | 68 documents |
| `pnpm contracts:check` | PASS | Account 22 operations，Admin 44 operations |
| 核心 Edge/Deno tests | PASS | 74 passed / 0 failed |
| `pnpm build` | PARTIAL | 两个 Next app 和 Turbo 均已输出成功结果，但审查任务随后主动停止了仍处于 Runner 生命周期中的命令，因此不记正式 PASS |

本轮没有执行完整 pgTAP、本地 Supabase 全矩阵、Hosted Staging、真实 Provider 或 Production 验证，不能把它们视为 PASS。

## 推荐实施顺序

第一批先恢复可信质量门槛：

1. 修复全仓格式问题。
2. CI 增加真正的全仓 `format:check`。
3. 为 `template-preview` 增加 Consumer BFF 单元测试，使 `pnpm test:unit` 真正通过。
4. CI 改用 `pnpm install --frozen-lockfile`。
5. 把 `test:api` 改为真实 Edge/API 聚合入口，并让 `task-0801` 复用该入口。

第二批再处理运行时风险：上游 timeout、Maintenance capability、Admin BFF allowlist、生产 Provider HTTPS。

第三批处理工程结构和仓库卫生：拆分超大 Edge 文件、统一工具链、去掉 Windows shell 警告与绝对路径、启用 Deno lock、整理生成产物与模板遗留。

## 建议保持的架构资产

- PostgreSQL `private` 领域过程继续作为业务规则唯一写入口。
- Account/Admin/Maintenance executor role 继续分离。
- Platform Key 与用户身份继续保持两个独立验证维度。
- Browser → same-origin BFF → central API 的访问结构继续保持。
- Billing Provider fact → Inbox → processing job → entitlement 的事实链继续保持。
- 文件数据库状态与 Storage 真实对象之间继续采用可恢复状态机。
