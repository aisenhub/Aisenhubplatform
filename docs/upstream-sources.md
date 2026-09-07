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
| Makerkit Lite | Admin工程基座 | 待固定准确仓库、commit、license并确认实际依赖 |
| Kiranism/next-shadcn-dashboard-starter | Admin表格、布局、筛选交互 | 仅参考UI，不迁Auth/组织/Billing |
| Cinderblock | RLS与hostile fixture模式 | 名称存在歧义，移植前先固定准确仓库 |
| quteam/license-manager | 兑换码生成、掩码和交付模式 | 仅参考，不继承未核验安全声明 |
| OfferKit | 原子兑换、ledger模式 | 名称存在歧义，移植前先固定准确仓库 |
| JDIZM/supabase-express-api | Admin查询、分页语义 | 不迁Express/工作区/RBAC架构 |

每次实际移植必须登记：Module、Repository URL、Commit、License、Copied Files、Adapted Files、Removed Dependencies、Reason、Last Reviewed。提交THIRD_PARTY_NOTICES并保留要求的版权声明；禁止整仓拼接或用未知来源片段实现安全核心。

依赖优先级：官方SDK/文档 → 已核验OSS模式 → Starter胶水 → 项目自有Domain。Auth不自造；Platform、Principal、Tenant Integrity、Grant规则、单管理员和严格文件预算属于本项目领域，不让Starter替代。
