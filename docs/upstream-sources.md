# 上游来源与官方能力 v1.2

本文件从属于 [架构基线](architecture.md)。核对日期：2026-09-07。本文链接是官方能力依据；示例版本不能直接替代项目锁文件。

## 官方依据

| 来源 | 对应决策 |
|---|---|
| [Supabase Changelog](https://supabase.com/changelog) | 升级前检查相关breaking change，不自动使用latest |
| [Postgres连接](https://supabase.com/docs/guides/functions/connect-to-postgres) | Edge可用SQL客户端访问数据库；本项目固定事务连接池和最小角色 |
| [自定义schema](https://supabase.com/docs/guides/api/using-custom-schemas) | Data API可达性与角色权限是不同层；private不暴露 |
| [会话](https://supabase.com/docs/guides/auth/sessions) | JWT有效不等于会话仍存在；敏感校验考虑session_id |
| [JWT](https://supabase.com/docs/guides/auth/jwts) | 项目issuer、用户身份、签名验证；不把Global JWT当平台登录证明 |
| [SSR高级指南](https://supabase.com/docs/guides/auth/server-side/advanced-guide) | Cookie刷新和禁止缓存认证响应 |
| [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) | Provider关联交由官方Auth，不自建邮箱合并 |
| [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) | 生产精确redirect配置，应用注册表不能替代官方allowlist |
| [签名上传](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl) | 签名有效期内无需再次认证；v1.2采用受控后端上传避免依赖其即时撤销 |
| [数据库备份](https://supabase.com/docs/guides/platform/backups) | 不含Storage实际对象；独立对象备份与联合恢复 |
| [Edge限制](https://supabase.com/docs/guides/functions/limits) | 小文件后端传输仍需在真实BFF/Edge验证内存、并发与超时 |

本次已读取changelog索引。与实施相关的变更包括托管Auth邮件模板条件、日志接口变更及数据库扩展版本固定行为；项目尚未选定这些部署细节，不能宣称已适配。上线前按实际项目套餐、邮件服务、日志适配器和数据库扩展逐项核验。自托管网关/配置breaking change不作为当前托管Supabase基线的实施步骤。

## 开源移植登记

当前仓库尚无上游代码、锁文件或迁移，以下仅是参考定位，不代表已经安装、审计或确认许可证兼容。

| 项目 | 用途 | 当前状态 |
|---|---|---|
| Makerkit Lite | Admin工程基座 | 已只读确认makerkit/nextjs-saas-starter-kit-lite，候选commit c5cba64391a80620309c4178163dc2df42568d1b、MIT；尚未导入或完成安装验证 |
| Kiranism/next-shadcn-dashboard-starter | Admin表格、布局、筛选交互 | 仅参考UI，不迁Auth/组织/Billing |
| Cinderblock | RLS与hostile fixture模式 | 名称存在歧义，移植前先固定准确仓库 |
| quteam/license-manager | 兑换码生成、掩码和交付模式 | 仅参考，不继承未核验安全声明 |
| OfferKit | 原子兑换、ledger模式 | 名称存在歧义，移植前先固定准确仓库 |
| JDIZM/supabase-express-api | Admin查询、分页语义 | 不迁Express/工作区/RBAC架构 |

每次实际移植必须登记：Module、Repository URL、Commit、License、Copied Files、Adapted Files、Removed Dependencies、Reason、Last Reviewed。提交THIRD_PARTY_NOTICES并保留要求的版权声明；禁止整仓拼接或用未知来源片段实现安全核心。

本轮开发规划补充了[固定commit与工具核对](development/decision-register.md)；下一步按T01/T02完成脚本审查、导入清单与clean install。候选版本不代表已通过兼容性或供应链审查。

依赖优先级：官方SDK/文档 → 已核验OSS模式 → Starter胶水 → 项目自有Domain。Auth不自造；Platform、Principal、Tenant Integrity、Grant规则、单管理员和严格文件预算属于本项目领域，不让Starter替代。

## T01 固定上游与导入审查

核验日期：2026-09-07。任务分支：`task/T01-source-inventory`。

| 项目 | 核验结果 |
|---|---|
| 上游仓库 | `https://github.com/makerkit/nextjs-saas-starter-kit-lite` |
| 固定 commit | `c5cba64391a80620309c4178163dc2df42568d1b`，可通过 fetch 取得并成功 detached checkout |
| 许可证 | MIT；导入时保留 MakerKit 版权声明 |
| 根 Node 约束 | `>=22.13.0`；本机 Node `24.19.0`，路径为 `D:\APP\Base\Nodejs\node.exe` |
| pnpm | 上游 `packageManager=pnpm@11.18.0`；本机 `11.24.0`，不得静默改写上游 lock |
| lockfile | `pnpm-lock.yaml`，lockfile v9；Supabase CLI 包由 lock 解析为 `2.111.0` |
| 本机 Docker | Docker Desktop 服务可用，客户端/服务端 `29.7.2` |
| Supabase CLI | PATH 与已检查的工具目录均未发现；T02 优先使用项目内固定版本，不安装全局副本 |
| Deno | PATH 与已检查的工具目录均未发现；T03 前需按固定版本补齐，不能把缺失当作已验证 |

上游目录审查结论：`apps/web` 应改造为 `apps/admin`，`apps/e2e` 应改造为 `apps/template-preview`；`packages/supabase` 只能作为 Auth/SSR 适配参考，不能原样保留其直接业务表访问或 service-role 管理路径。`apps/web/supabase` 应迁至根 `supabase/` 后重新设计，旧的 `public.accounts`、Storage bucket/policy、Auth trigger、Starter RLS/GRANT 和删除用户逻辑不得作为本项目生产迁移直接执行。`packages/features/accounts` 的个人/团队账户模型也不得当作本项目 `platform_accounts`。

上游脚本审查结论：根 `postinstall` 会执行 `manypkg fix`；根与 workspace 含 `git clean -xdf`；`lint:fix`、`healthcheck` 含自动修复；`apps/web` 含 `supabase:deploy`（link 后 `db push`）；CI 使用 `lts/*`、未固定 pnpm 版本，E2E 流程使用 `supabase/setup-cli@v1` 但未锁定 CLI 版本。T02/T03 必须先禁用或改造成受控、只检查、不部署的脚本。

固定 commit 的 README 与 package manifest 对 Next.js 版本存在文字不一致；导入以 manifest、workspace catalog 和 lockfile 为准。上游跟踪的 `.env*` 文件包含非空配置项（包括 service-role 变量），T02 不得复制这些文件或其值，只能创建脱敏的 `.env.example`。

工具补齐方案：Supabase CLI 依照官方文档采用项目级依赖并固定版本，命令通过 `pnpm exec supabase` 运行；若确需系统副本，目标只能是 `D:\APP\Codex\SupabaseCLI\`。Deno 依照官方 Windows 安装文档取得可复现版本，目标只能是 `D:\APP\Codex\Deno\`；版本确认前不写入固定号，不使用默认 C 盘安装路径。参考：[Supabase CLI 安装文档](https://supabase.com/docs/guides/local-development/cli/getting-started?platform=npx&queryGroups=platform)、[Deno Windows 安装文档](https://docs.deno.com/runtime/getting_started/installation/)。
