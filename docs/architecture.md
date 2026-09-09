# Multi-Platform Account Backend Architecture v1.2

**状态：修订后的设计基线；尚未实现或通过生产验收。**  
**修订日期：2026-09-07。** 本版取代 v1.1 及所有更早草案。

本系统为多个自营平台提供统一身份、平台账户、权益、配置文件及管理员控制台。主基座为 Makerkit Lite，基础设施为 Supabase；采用模块化单体，V1 不拆微服务。

## 1. 文档权威与阅读顺序

本文件维护范围、架构和不可变边界；下列专题是同一 v1.2 基线的组成部分，并非可选建议。同一规则只在所属专题维护，其他文档引用它。

| 文档 | 内容 |
|---|---|
| [核心数据模型](data-model.md) | 核心 SQL、关系和删除约束 |
| [认证与安全](auth-security.md) | 平台信任、JWT、SSR、管理员、数据库角色、生命周期、限流 |
| [订阅与兑换](subscription-redemption.md) | Free、Ledger、Projection、SQL、锁、幂等、兑换码交付 |
| [配置文件](config-files.md) | 后端受控上传、真实字节配额、替换、删除与对账 |
| [接口与 SDK](api-sdk.md) | HTTP 权限、稳定类型、BFF、SDK、模板与兼容 |
| [运维与验收](operations.md) | 环境、恢复、轮换、发布、任务、测试与告警 |
| [审核问题闭环](review-v1.2.md) | 原审核问题、修订位置和验收证据 |
| [上游来源](upstream-sources.md) | 官方能力依据、开源 commit 与许可证核验 |

当前官方平台安全规范优先，随后是本文件的领域和安全不变量、专题合同、实现。自动化测试验证合同，不能用错误测试覆盖合同。平台 breaking change 先修订基础设施适配层及文档，再升级依赖，不以始终安装 latest 替代可重现版本。

[v1.1 归档](archive/architecture-v1.1.md)仅供追溯，不得作为实现依据。专题 SQL 是设计约束示例，不是已执行 migration；完整迁移、权限、函数及运行验证仍须实现。

## 2. 已确认的范围与前提

- 所有 Platform 均由同一运营主体管理，是相互信任的自营应用；不向互不信任的第三方发放接入凭据。
- Global Identity 共用 Supabase auth.users，只回答“是谁”；Profile、Preferences、账户状态、权益、套餐、兑换码及文件按平台隔离。
- Platform = Tenant。V1 不引入 Organization、Workspace、Team、Platform Admin 或通用 RBAC。
- 同一身份可跨平台使用，但不承诺跨域自动登录。身份关联不复制平台数据；不自动合并两个已有业务 user_id。
- 管理员账号专用于控制台，不在普通产品登录或激活平台账户。
- 配置文件是小型不可信 opaque object。**浏览器通过 BFF 和 Account API 上传，后端按实际字节限额后才写入 Storage；V1 不发放浏览器上传签名。**
- V1 权益来源仅兑换码和管理员授权；未来支付由独立 Billing Domain 调用同一权益入口。

平台核心业务，例如 Agent、Chat、Workflow、CRM、文章和业务用量计费，由各平台维护。平台独立部署登录、注册、Pricing、账户设置和业务 API；本项目不部署统一普通用户 Account Center、Login Portal 或跨域 Auth Broker。

## 3. 部署与领域边界

~~~text
平台用户浏览器
  ├─ Auth Adapter → Supabase Auth（Publishable Key）
  └─ 同源 Platform BFF / Business API
       → account-server（用户 JWT + 该平台 API Key）
       → Central Account API / Supabase Edge Functions
           ├─ Principal / Authorization
           ├─ Platform / Profile / Preferences
           ├─ Entitlement / Redemption
           ├─ Config Files
           ├─ SQL repository → transaction pooler → private functions
           └─ server-only Storage client → private bucket

Admin Browser → Next.js / Makerkit Admin Server
  → verifySuperAdmin + session + AAL2 + recent MFA（高风险）
  → 同一领域过程，以独立 admin_executor 数据库凭据调用

Durable scheduled worker → cleanup / reconciliation / recovery jobs
~~~

生产部署物：Supabase Project、数据库迁移、Auth 配置、私有 Storage、Account API、Admin Console 和受保护的调度任务。Registry 是可安装静态产物，发布时提供固定版本可访问地址；template-preview 只用于开发与 CI。

Admin 与 Account API 可独立部署，但权益、账户状态、配额和删除必须调用同一数据库领域过程。Admin 不能直接更新 subscriptions 或绕过文件状态机，禁止在 Next.js Server Action 复制另一套业务规则。

Account API 分层为 HTTP Adapter → Principal → Domain Service → Repository。SQL 连接通过事务连接池调用非公开 private 函数。Supabase Secret Key 供受控 Auth/Storage 操作使用，不是 SQL 密码，也不会使 private schema 经 Data API 可访问。

## 4. 核心模型与授权原则

完整字段和 SQL 见核心数据模型。Platform Account 是所有平台用户状态根；仅挂一个 platform_account_id 的 Profile/Preferences 由唯一父账户确定租户。含多个租户敏感引用的表必须显式携带 platform_id，使用复合外键，同时约束同账户及同套餐的一致性。

platforms.config 只放非敏感、弱结构的 UI/实验配置；授权开关、默认 Plan、文件策略、Origin 和 Secret 不放入该 JSON。allow_activation 是首次加入平台的开关，不是共享 Auth 的全局注册开关。

activate 在事务内验证平台 active、用户有效、非管理员且非全局删除中。已有 active 账户直接返回；suspended/closed 返回对应错误，不能重开。首次激活还须满足 allow_activation。unique(platform_id,user_id) 处理并发首次激活，Profile、Preferences、权益状态行与审计同事务创建。

Free 在读取权益时回退提供，不生成永久 Free Grant。关闭激活不妨碍已有账户登录。Platform Disable 阻止普通用户 Account API 与业务授权；Suspend 拒绝业务和账户 mutation，仅允许 principal 返回自身状态；Close 默认不可自助重开。平台关闭不删除 Global Identity。

普通业务不缓存 Principal 或权益。敏感写入在数据库事务中再次检查平台、账户与凭据状态；停用提交后的新授权拒绝，已执行中的动作按既定事务顺序完成，不承诺跨系统瞬时撤销。用户及 Admin 文件下载均经过授权后端代理。

## 5. 数据库与密钥不变量

- 所有 exposed tables 启用 RLS；显式撤销 PUBLIC、anon、authenticated 的核心表和函数权限。
- private 不加入 exposed schemas；Account/Admin 使用仅能执行所需领域函数的独立数据库角色。
- 私有函数固定 search_path、全限定引用、参数化 SQL，默认撤销 EXECUTE。owner 为无登录专用角色，只拥有所需表权限和 RLS policy，不使用 postgres 或全局 BYPASSRLS。
- 函数重新验证状态和关系；读查询同时按 platform_id、platform_account_id 过滤。复合 FK 不能代替读取授权。
- Grant/Event/Audit 普通运行时不可 UPDATE/DELETE；清除角色仅按受控流程匿名化个人字段，不改变历史业务效果。
- Platform API Key 只留在 BFF，数据库存带版本的 HMAC 与掩码。Supabase Secret、SQL 凭据、平台 Key HMAC、兑换码 HMAC 分用途隔离。
- 管理员授权依赖 singleton 表、实时会话、AAL2；高风险动作验证近期 MFA，不使用 user_metadata.is_admin。

## 6. 工程、SDK 与模板

保留 Makerkit Lite 的 Next.js、Turborepo、pnpm、TypeScript、Tailwind、shadcn/ui 及适用的 Query/Form/Table/Test 基础设施；实际能力以固定 upstream commit 核验，不宣称当前空仓库已有这些依赖。

MakerKit 仅作为工程结构、组件组织和实现边界的参考，不作为产品视觉模板。Admin 与 Consumer 的 UI 视觉独立设计；UI 评审统一关注操作是否顺畅、信息是否清楚、状态反馈是否及时、页面是否有质感。

初始化时 apps/web 改为 apps/admin；清除普通产品 Dashboard、Billing UI、Demo、示例业务与品牌内容，保留许可证要求声明。已有同类库不重复引入，不另采用 React Admin、Refine 或第二套 UI/Form/Query 框架。

~~~text
apps/admin/                 Admin 控制台
apps/template-preview/      非生产模板集成应用
packages/account-auth/      框架无关 Auth Contract
packages/account-auth-nextjs/ SSR、Cookie、PKCE、Callback
packages/account-server/    BFF → Account API 的 server-only SDK
packages/domain/            共用领域类型、校验及纯逻辑
packages/ui/                Admin 与模板基础组件
supabase/functions/         Account HTTP adapter 与任务入口
supabase/migrations/         CLI 生成的时间戳迁移
supabase/tests/              pgTAP、权限、并发及恢复验证
registry/                   固定版本 UI 安装产物
docs/                       v1.2 架构合同
~~~

统一发布 account-auth、account-auth-nextjs、account-server，不发布未存在的 account-browser 兼容别名。模板只复制 UI，不复制授权、订阅计算、兑换或配额逻辑。

模板提供登录、注册、OAuth、密码重置、公开套餐、Profile、Preferences、权益、兑换和文件管理；品牌及 UI 可改。Pricing 显示套餐、权益、兑换入口与联系购买，不包含 Checkout。

## 7. 实施顺序

1. 固定上游 commit/license、依赖锁文件，建立 Admin-only 仓库、CI、结构化日志及脱敏。
2. 实现 Auth/SSR/MFA、平台及身份生命周期、私有 SQL 连接、角色、权限负向测试、管理员恢复流程。
3. 实现共用 Principal、公开套餐 API、SDK 和真实 Consumer App；验证跨用户/跨平台和 BFF 安全。
4. 实现套餐、Ledger、Projection、批次交付；同步完成约束、并发、幂等、审计和重放测试。
5. 实现受控上传、配额、Replace、删除及任务租约；同步完成故障注入、容量、重试和对账验证。
6. 完善 Admin CRUD、Registry、模板预览和全新项目安装测试，完善可观测性。
7. 独立 Staging 验证联合恢复、Secret 轮换、升级兼容及部署限制；通过生产门槛再上线。

安全、审计、并发测试贯穿每一步，不能等 UI 完成后补。普通 merge 不运行生产迁移；每个功能同时交付成功、拒绝和恢复路径。

迁移依赖：private/roles → platforms/accounts/profile/preferences/origins → plans/default FK → entitlement state/subscriptions/grants → batches/codes → events → files/policies/leases → admin/keys/idempotency/audit/deletion jobs → RLS/函数/trigger/index/调度。后置外键通过 ALTER TABLE 添加，不省略约束。

空库 reset 与从上一发布版本升级均须通过。高频 FK 建索引，避免重复 unique 已覆盖的索引；覆盖 user_id、账户 Grant sequence、平台 events/audit 时间、Batch Code、待重试文件和任务查询，并以实际查询计划验证。

## 8. 新平台接入和最终验收

新自营平台只通过配置创建 Platform、注册精确 Origin/Redirect、创建 Plan/默认 Free/文件策略、平台凭据和兑换批次；安装三个 SDK 包与模板，接入业务授权并执行集成测试。不得修改核心 Domain 或新增 hardcoded platform 分支。

V1 必须证明：

- 跨用户、跨平台、非法账户/Plan/Batch/Event 关系均被拒绝；私有函数不经浏览器 Data API 可达。
- Free→Pro、到期回退、Plan 冲突、永久权益、撤销/暂停/恢复及 Projection 重放符合合同。
- 同码抢兑、多码首次并发、兑换与 Admin Grant 并发不丢权益；同 key 重试不重复副作用。
- 超限文件在 Storage 写入前拒绝；恶意声明大小、满配额 Replace、请求中断及删除失败不绕过配额。
- 管理员使用专用账号、有效会话、AAL2 与近期 MFA；恢复无隐藏常驻管理员。
- Platform/API Key 停用阻断后续授权；中央服务故障不自动放行；关闭平台不影响其他平台账户。
- 联合恢复找回数据库及配置文件，并完成兑换码、凭据的恢复风险处理。
- 全新 Consumer App 完成 Auth、Pricing、激活、账户、兑换和文件链路，Registry 产物可重现。

具体测试矩阵、恢复指标和发布证据见运维与验收文档。文档审核通过不等于生产测试已通过。

## 9. 后续演进

支付由 Billing Domain 处理 Provider 验签、事件幂等、客户/订阅/账单/退款状态，再调用共用 Grant 接口；V1 不实现 payment 写入口。退款通过 Ledger reversal，不能直接改 Projection。

组织、第三方平台、平台绑定授权、跨域 SSO、用量/席位计费、Plan 版本、客户端文件加密、事件总线和多区域按真实需求重新评审，V1 不预建。

改变 Global Identity、平台信任、租户约束、Ledger 算法、上传方式、管理员边界或 SDK 合同，必须记录架构决策并更新相应验收用例，不允许局部实现静默改变。
