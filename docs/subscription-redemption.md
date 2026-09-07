# 订阅、权益和兑换 v1.2

本文件从属于 [架构基线](architecture.md)，依赖 [核心数据模型](data-model.md)。Admin 与 Account API 必须共用本文的数据库写入过程。

## 1. 唯一权益规则

| 当前状态 | 请求 | 结果 |
|---|---|---|
| 无有效付费 Grant，有默认 Free | 读取 | 返回 Free，end=NULL，entitlement_kind=free |
| 无有效付费 Grant，无默认 Free | 读取 | effective_status=none，plan=NULL，features={} |
| Free 或全部付费 Grant 已结束/撤销 | 兑换任意 active paid Plan | 从数据库当前时间起授予 |
| 有同 Plan 有限期 Grant | 续期 | 从 max(now,所有未撤销同 Plan Grant 的 ends_at) 开始 |
| 有尚未结束的不同 Plan Grant（含未来已排期） | 兑换/新增 Grant | PLAN_CONFLICT，不消耗兑换码 |
| 有同 Plan 永久 Grant | 有限续期或重复永久授权 | ENTITLEMENT_PERPETUAL，不消耗兑换码 |
| 权益暂停或平台账户不 active | 普通兑换 | 拒绝，不自动恢复 |

Free 是回退策略，不写入 Grant，也不占用付费续期位置。Free→Pro 无冲突；付费到期自动回退当前默认 Free。current_period_end=NULL 必须结合 entitlement_kind 区分 free/perpetual/none。

V1 不做自动升级/降级。Admin 如需换 Plan，先撤销阻塞的未结束 Grant，再通过独立有原因且可审计的操作授予新 Plan。永久 Grant 仅 Admin 可授予；首次新增永久授权必须没有未结束付费 Grant，避免吞并已有有限权益。

暂停是访问控制，不冻结时钟、不自动补时；恢复只移除暂停，过期照常回退。Admin Grant 也遵守暂停限制，应先恢复或明确执行撤销。Plan 归档拒绝新 Grant，历史有效 Grant 仍提供该 Plan 当前 features。

时间统一 UTC，由数据库生成一次 operation_now。区间为 [starts_at,ends_at)，end=now 已过期。day=24小时；month/year 使用 UTC 日历加法，月末夹到目标月最后一天，2月29日加一年为次年2月28日。每个 Grant 独立计算，不做隐式月底锚定或补偿。

## 2. 可重放 Ledger

subscription_grants 保存不可变的正向授权；subscription_events 保存 granted/revoked/paused/resumed。事件按每账户单调 sequence 排序；在账户锁下以历史最大 sequence+1 分配，不依赖 Projection 分配或客户端时间。

- granted 引用新 Grant，source/operation_id 永久唯一，防止幂等响应过期后重复授予。
- revoked 引用同账户原 Grant，立即取消该 Grant 当前和未来权益；保留其历史，不修改原 starts_at/ends_at。
- 撤销中间续期不会把后续 Grant 提前，不压缩或填补间隔。缺口期间回退 Free/none。
- paused/resumed 不引用 Grant；最后一个此类事件决定访问暂停状态。
- 修正时间或 Plan 必须先撤销原 Grant 再授予新 Grant；同一“修正操作”在一个事务内追加两事件并重算。

重放算法：选择created_at<=as_of的事件并按sequence读取，构建Grant和撤销集合、最终暂停状态；在as_of时刻选择覆盖该时刻的未撤销Grant。有效Grant必须属于同一Plan；将相接/重叠的同Plan区间合并，得到当前连续区间起止。遇到永久Grant，连续区间end=NULL。无覆盖区间时回退默认Free/none；paused覆盖为suspended且不给有效features。历史as_of重放验证授权区间，不承诺历史features或默认Free配置快照。

写入时刷新subscriptions；它仅存付费区间与暂停状态，Free/none由读取结果回退表达，不往Projection填入永久Free记录。读取时同时检查last_event_sequence、当前区间及next_transition_at；到达边界在账户锁下同步重算后返回，不能依赖定时任务及时更新。未来Grant开始也属于边界，Plan features及默认Free从当前配置读取。定时刷新仅优化性能。

## 3. SQL 设计

~~~sql
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  plan_id uuid,
  status text not null default 'active' check (status in ('active', 'suspended')),
  started_at timestamptz,
  current_period_end timestamptz,
  next_transition_at timestamptz,
  last_event_sequence bigint not null default 0 check (last_event_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_account_id),
  unique (platform_id, platform_account_id, id),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, plan_id)
    references public.plans(platform_id, id) on delete restrict,
  check ((plan_id is null and started_at is null and current_period_end is null)
    or (plan_id is not null and started_at is not null)),
  check (current_period_end is null or current_period_end > started_at)
);

create table public.subscription_grants (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  plan_id uuid not null,
  source text not null check (source in ('redemption_code', 'admin')),
  operation_id uuid not null,
  redemption_code_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (platform_id, source, operation_id),
  unique (platform_id, platform_account_id, id),
  unique (platform_id, platform_account_id, redemption_code_id, id),
  unique (redemption_code_id),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, plan_id)
    references public.plans(platform_id, id) on delete restrict,
  check (ends_at is null or ends_at > starts_at),
  check (source = 'admin' or ends_at is not null),
  check ((source = 'redemption_code' and redemption_code_id is not null
      and operation_id = redemption_code_id)
    or (source = 'admin' and redemption_code_id is null))
);

create table public.redemption_code_batches (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id) on delete restrict,
  plan_id uuid not null,
  name text not null,
  quantity integer not null check (quantity between 1 and 1000),
  duration_value integer not null check (duration_value > 0),
  duration_unit text not null check (duration_unit in ('day', 'month', 'year')),
  expires_at timestamptz not null,
  status text not null default 'pending_delivery'
    check (status in ('pending_delivery', 'active', 'disabled')),
  delivery_deadline timestamptz not null,
  delivered_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (platform_id, plan_id, id),
  foreign key (platform_id, plan_id)
    references public.plans(platform_id, id) on delete restrict,
  check (expires_at > created_at),
  check (status <> 'active' or delivered_at is not null)
);

create table public.redemption_codes (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  batch_id uuid not null,
  plan_id uuid not null,
  code_hmac text not null,
  hmac_key_version smallint not null check (hmac_key_version > 0),
  code_prefix text,
  code_suffix text,
  status text not null default 'unused'
    check (status in ('unused', 'redeemed', 'disabled')),
  redeemed_by_platform_account_id uuid,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (hmac_key_version, code_hmac),
  unique (platform_id, id),
  unique (platform_id, redeemed_by_platform_account_id, plan_id, id),
  foreign key (platform_id, plan_id, batch_id)
    references public.redemption_code_batches(platform_id, plan_id, id) on delete restrict,
  foreign key (platform_id, redeemed_by_platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  check ((status = 'redeemed' and redeemed_by_platform_account_id is not null
      and redeemed_at is not null)
    or (status <> 'redeemed' and redeemed_by_platform_account_id is null
      and redeemed_at is null))
);

alter table public.subscription_grants add constraint grant_redeemed_code_fk
  foreign key (platform_id, platform_account_id, plan_id, redemption_code_id)
  references public.redemption_codes
    (platform_id, redeemed_by_platform_account_id, plan_id, id)
  on delete restrict deferrable initially deferred;

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  subscription_id uuid,
  sequence bigint not null check (sequence > 0),
  event_type text not null check (event_type in ('granted', 'revoked', 'paused', 'resumed')),
  grant_id uuid,
  operation_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (platform_id, platform_account_id, sequence),
  unique (platform_id, platform_account_id, operation_id, event_type),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, subscription_id)
    references public.subscriptions(platform_id, platform_account_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, grant_id)
    references public.subscription_grants(platform_id, platform_account_id, id) on delete restrict,
  check ((event_type in ('granted', 'revoked') and grant_id is not null)
    or (event_type in ('paused', 'resumed') and grant_id is null))
);

create unique index one_granted_event_per_grant
  on public.subscription_events(grant_id) where event_type = 'granted';
create unique index one_reversal_per_grant
  on public.subscription_events(grant_id) where event_type = 'revoked';

create table public.redemption_events (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  redemption_code_id uuid,
  grant_id uuid,
  result text not null check (result in ('success', 'rejected')),
  error_code text,
  request_id uuid not null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, redemption_code_id)
    references public.redemption_codes(platform_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, grant_id)
    references public.subscription_grants(platform_id, platform_account_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, redemption_code_id, grant_id)
    references public.subscription_grants
      (platform_id, platform_account_id, redemption_code_id, id) on delete restrict,
  check ((result = 'success' and redemption_code_id is not null
      and grant_id is not null and error_code is null)
    or (result = 'rejected' and grant_id is null and error_code is not null))
);

create unique index one_success_per_code
  on public.redemption_events(redemption_code_id) where result = 'success';
create index redemption_events_platform_time
  on public.redemption_events(platform_id, created_at desc);
~~~

成功兑换事件通过四字段复合FK绑定该Grant对应的同一兑换码；失败事件grant_id=NULL，由已有同平台code FK约束。跨平台猜码统一视为INVALID_CODE，code_id留NULL。不得删除成功事件的四字段约束而只保留两组彼此独立的FK。

subscription_id 是可选的诊断关联，新事件默认 NULL；历史关系非空则必须同账户。重建 Projection 使用同一 ID 更新，不删除被事件引用的行；验收在隔离副本中清空 Projection 内容再重建，或构建 shadow projection 比较，不能为重放删除 Ledger。

Batch 的 Plan、数量、时长、到期时间、密钥版本对应生成结果在创建后不可改；只可变更交付/禁用状态。有效期只从 Batch 读取，避免 Code 与 Batch 两份到期来源矛盾。到期按时间计算，不依赖 cron 修改 status。

## 4. 事务与并发

普通权益写入统一锁顺序：identity_lifecycle（SHARE）→ platform（SHARE）→ platform key（SHARE）→ idempotency claim → platform_account（UPDATE）→ batch（SHARE，如有）→ code（UPDATE，如有）→ plan（SHARE）→ projection。

所有 Admin Grant/revoke/pause/resume 同样锁目标账户，复用相同过程；没有订阅行也有账户行可锁。激活冲突按唯一键处理后再获取账户锁。平台配置、套餐归档、批次禁用、Key 撤销先取 platform UPDATE 锁，再按同一方向取子对象锁；锁期间不调用网络。

兑换事务：校验会话/平台凭据 → 申请幂等记录 → 锁账户 → 查找并锁Batch/Code → 重新检查账户active、Batch active且已交付、Code unused、Batch未到期、Plan active且paid → 应用冲突规则 → 生成Grant/事件 → 标记Code redeemed → 重算Projection → 写成功兑换事件与Audit → 完成幂等响应 → 提交。HMAC查找仅用于定位，锁后重查所有条件。operation_now在取得账户锁后用数据库clock_timestamp一次确定，所有该操作事件显式使用同一时间，避免长时间等锁事务沿用过早的事务开始时间；as_of与时间比较统一UTC。

并发禁用与兑换以平台锁决定先后：禁用先提交则兑换拒绝；兑换先提交则保留已授予权益，禁用不追溯撤销。数据库异常整体回滚。连接 lock_timeout=2s、statement_timeout=5s；超时可重试但不得重复作用。

## 5. 幂等、错误和审计

- Idempotency-Key 必填，1～128 个可打印 ASCII 字符。scope 由服务端构造，见数据模型；request_hash 是规范化业务输入的 SHA-256，不包含时间戳、JWT 或原始 Secret。
- 同 scope/key/hash 返回既有业务结果；不同 hash 返回 409 IDEMPOTENCY_CONFLICT。每次重放前仍重新鉴权，不因缓存成功结果绕过停用。
- claim 与业务在同一事务。并发调用等待首事务；等待超时返回 409 OPERATION_IN_PROGRESS 与 Retry-After。pending 不单独提交，不遗留永久占位。
- 确定性业务拒绝（过期、Plan 冲突等）在无业务写入情况下提交幂等错误结果和 rejected event。相同 key 重试仍返回该拒绝；用户修改条件后应新建 key。
- 认证失败与限流发生在事务前，不占幂等记录。SQL/网络故障回滚，不缓存 5xx；网关使用 request_id 记录脱敏故障，集中日志接收器确认后才视为投递成功。接收失败计数告警，不宣称所有基础设施失败都能进入业务数据库。
- 成功 Grant、Code、Domain Event、Audit、幂等结果必须同事务。成功事务不可缺审计；失败日志不能通过捕获异常后继续提交部分业务实现。
- 普通幂等响应保留7天。Code 的一次性约束、Grant operation_id 唯一性永久保留；过期后的 Admin 重试先按 operation_id 找已有结果，参数不一致返回冲突。

Admin 手动操作提交 operation_id UUID、reason 和目标账户；operation_id 在页面一次操作开始时创建并持久保存到完成，同一操作网络重试不生成新 ID。字段变化代表新操作。

## 6. 兑换码生成、HMAC 和交付

采用31字符集合 ABCDEFGHJKMNPQRSTUVWXYZ23456789，用安全随机源与 rejection sampling 均匀生成26个随机字符，约128.81 bit；不得用随机字节直接模31产生偏差。前缀、版本和分隔符不计熵。

统一示例：AISEN-V1-7KM9-2XQ8-F3DP-V7RW-K6CY-MZTA-9H。随机载荷26字符，V1是HMAC key version。仅 trim 首尾 ASCII 空白、转 ASCII 大写、移除约定分隔符；拒绝其他字符，不进行 Unicode 模糊替换。

计算 HMAC-SHA256(key[version], platform_id + ":" + normalized_code)，数据库存 HMAC、版本和少量 mask。旧 key verify-only；新码只用当前 key。没有明文就不能重新哈希迁移旧 Code；旧 key 保留到所属 Batch 全失效，泄露时禁用对应未用 Batch 并重新发码。所有批次必须有到期时间。

创建批次采用两阶段交付：

1. Admin 近期 MFA 后提交生成操作，数据库创建 pending_delivery Batch 和 Codes；明文仅在生成进程内存中，通过 no-store 响应返回一次，禁止日志和持久缓存。
2. Admin UI 完成下载后让管理员确认已保存，再调用交付确认；服务端验证同一管理员会话、批次、数量与一次性 receipt HMAC，在10分钟期限内将 Batch 激活并审计。
3. receipt 原文只随首次响应返回，数据库只存其 HMAC、会话绑定和失效时间；不得将明文 Code 放入幂等响应缓存。创建重试只能返回批次 ID 与 pending 状态，不能恢复明文。
4. 响应丢失或未确认，Batch 不能兑换；期限后禁用。重新生成必须创建新操作和新 Batch，不复活旧批次。确认本身幂等。

Batch 须增加 delivery_session_id、delivery_receipt_hmac、delivery_confirmed_by 等交付字段，后台只能保存 receipt HMAC。禁用批次永不重新激活；“替换丢失码”必须先禁用原未用批次或原未用码，再生成新码，不追回已兑换权益。

## 7. 必测情景

Free→Pro、付费到期回退/无默认、同 Plan 续期、不同 Plan 冲突、永久授权、归档套餐；月末/闰年/UTC边界；撤销中间 Grant 形成缺口；暂停时间继续流逝；同码10次抢兑；无订阅多码并发；Admin 与兑换并发；Batch禁用并发；同key同/异参数；事务提交后响应丢失；所有事件非法外键；生成响应丢失导致批次不可用；重放结果在相同 as_of 与配置下完全一致。
