# 核心数据模型 v1.2

本文件从属于 [架构基线](architecture.md)。下面是核心表的可迁移设计；RLS、权限、触发器、索引和领域函数需在实现阶段补齐并验证，不应单独复制 SQL 后即视为可上线。

## 1. 平台、身份和账户

~~~sql
create schema if not exists private;

create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  allow_activation boolean not null default true,
  default_locale text,
  default_plan_id uuid,
  default_plan_kind text not null default 'free' check (default_plan_kind = 'free'),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id) on delete restrict,
  user_id uuid references auth.users(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  activated_at timestamptz not null default now(),
  suspended_at timestamptz,
  closed_at timestamptz,
  anonymized_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, user_id),
  unique (platform_id, id),
  check (
    (user_id is not null and anonymized_at is null)
    or (user_id is null and status = 'closed' and anonymized_at is not null)
  )
);

create table public.platform_profiles (
  platform_account_id uuid primary key
    references public.platform_accounts(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  locale text,
  timezone text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_preferences (
  platform_account_id uuid primary key
    references public.platform_accounts(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  row_version bigint not null default 1 check (row_version > 0),
  updated_at timestamptz not null default now()
);

create table public.platform_auth_origins (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id) on delete restrict,
  environment text not null
    check (environment in ('local', 'preview', 'staging', 'production')),
  origin text not null,
  oauth_callback_url text not null,
  password_reset_url text not null,
  email_confirmation_url text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, origin),
  unique (platform_id, id)
);

create table private.system_admin (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.identity_lifecycle (
  user_id uuid primary key references auth.users(id) on delete restrict,
  state text not null default 'active' check (state in ('active', 'deleting')),
  updated_at timestamptz not null default now()
);
~~~

user_id 可空仅为受控 Global Purge 保留无身份墓碑账户。普通 Close 不清空 user_id；业务运行角色不能修改归属。平台资料只引用唯一账户根，不需要重复 platform_id。

identity_lifecycle 首次受控访问时 insert-on-conflict 建立。普通写入锁定并检查该身份门闩；Global Delete 设置 deleting 后，激活/兑换/上传/下载和 BFF 授权均拒绝。Auth 中用户缺失时不能重建门闩。

Origin 规范化后存储，不含路径；生产只允许 HTTPS，callback 必须与同一行 origin 同源且路径精确匹配。一个环境内同一 origin 只属于一个平台。该表不是 Supabase allowlist 的替代，部署控制器负责同步和漂移检测。

## 2. Plan 和默认 Free

~~~sql
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  kind text not null check (kind in ('free', 'paid')),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, code),
  unique (platform_id, id),
  unique (platform_id, id, kind)
);

alter table public.platforms add constraint platform_default_free_plan_fk
  foreign key (id, default_plan_id, default_plan_kind)
  references public.plans(platform_id, id, kind) on delete restrict;
~~~

默认 Plan 可为 NULL，表示无默认权益；非空必须引用同平台 Free Plan，数据库直接保证。归档默认 Free 前，必须同事务清空或更换默认 Plan；归档套餐停止新 Grant，不撤销已有有效 Grant。kind、platform_id 在 Plan 被引用后不可改变。

features 是当前实时配置；更新立即影响后续权益读取，不承诺 grandfathering。只验证 JSON 对象、大小和字段基础类型，不提前构建通用 feature engine；业务平台自行理解业务键，统一后端不执行配置中的代码。

## 3. 辅助表合同

以下字段表是迁移的强制输入，实际类型及非空约束必须按所述语义落实。

| 表 | 必备字段及约束 |
|---|---|
| private.platform_api_keys | id PK、platform_id FK、name、key_hmac（64字符小写hex）、hmac_key_version、prefix/suffix、status(active/revoked)、expires_at、revoked_at、created_by/ revoked_by nullable Auth FK SET NULL、creation_operation_id UUID、created_at；unique(version,hmac)、unique(platform_id,creation_operation_id) |
| private.idempotency_keys | platform_id、platform_account_id、operation、actor_scope、idempotency_key、request_hash、state(pending/completed)、response_status/body、created_at、expires_at；上述 scope+key 唯一；复合账户 FK |
| public.audit_logs | id PK、request_id、actor_type、actor_user_id nullable Auth FK SET NULL、platform_id nullable、platform_account_id nullable、event_type、target_type/id、ip、user_agent、metadata、created_at |
| private.deletion_jobs | id PK、user_id nullable Auth FK SET NULL、scope、state、checkpoint、retry_count、next_attempt_at、last_error_code、created_at、completed_at；用户活跃删除任务唯一 |
| private.job_leases | job_kind、resource_id、lease_owner、lease_until、fencing_token、retry_count、next_attempt_at、last_error_code；unique(job_kind,resource_id) |

Audit的平台账户引用使用(platform_id,platform_account_id) → platform_accounts(platform_id,id)，并CHECK(platform_account_id IS NULL OR platform_id IS NOT NULL)。全局事件可没有平台；不能用伪平台占位。metadata不含Token、兑换码、签名、文件内容或直接身份资料。

actor_scope 对用户操作固定 user:账户ID，对 Admin 操作固定 admin:管理员ID；不能由客户端自行提供。目标账户仍在幂等 scope 中，避免管理员对两个账户使用相同 key 时冲突。没有目标账户的批次/密钥操作使用独立 private.admin_idempotency，unique(admin_user_id,platform_id,operation,key)，避免 NULL 破坏唯一性；全局 Admin 操作使用固定 scope 字符串而不是 nullable platform 唯一键。

## 4. 通用约束与维护

- 所有跨租户敏感关系使用复合 FK；同账户关系进一步包含 platform_account_id。事件中的非空 code/subscription/grant 引用必须能由数据库验证。
- Platform、Plan、Account、Code 不物理删除；Global Purge 留墓碑账户并脱离身份，文件内容按保留策略实际清除。
- 所有 updated_at 由统一 trigger 更新，业务方不能覆盖 created_at。原始事件排序不依赖客户端时钟。
- Profile/Preferences的row_version用于ETag/If-Match原子条件更新；成功PATCH递增，失败不变。updated_at不替代并发版本；该字段由DP1实施规格细化并同步于此，避免迁移和API各自采用不同版本模型。
- 业务 Ledger 的 effect 字段 append-only；管理员原因不得携带个人信息。受控清除可匿名化 actor/metadata，不得改变 Plan、时间、sequence 或 reversal 目标。
- 高风险审计同业务事务写入，审计写入失败则业务回滚。拒绝事件与基础设施失败的记录见订阅与兑换文档。
- 迁移中显式建立 RLS、REVOKE、最小权限 policy 和必要索引；public 表的位置不代表可公开读取。
