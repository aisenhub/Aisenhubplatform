# 配置文件 v1.2

本文件从属于 [架构基线](architecture.md)。文件不解析、不执行、不预览、不解压，扩展名不限。单一私有 bucket 为 platform-config-files，路径为 platform_id/platform_account_id/file_id；原始文件名仅作为 metadata，不进入路径。

## 1. 受控上传与硬限制

用户已选择严格限制真实大小和配额。V1 流程固定为 Browser → 同源 BFF → Account API → Storage；不向浏览器暴露上传签名、Storage 写权限或后端 Secret。Storage SDK 仅在通过真实字节检查后调用。

platform_file_policies 为 typed 表，platform_id PK/FK、enabled、max_file_bytes、max_files、max_total_bytes、updated_at。默认1 MiB/10个/10 MiB；V1 max_file_bytes 可下调但不得超过1 MiB，所有上限为正整数。调大单文件上限必须重新评审后端内存、网关和平台限制。

上传意图声明 size 只用于预约上限；Content-Length、MIME 和文件名都不可信。BFF 与 Account API 分别以有界读取器计数，最多读取 min(requested_size_bytes,max_file_bytes)+1 字节，超出立即终止，不调用 Storage。禁止在检查前使用无限制 arrayBuffer/formData 或把浏览器输入直接流式转发给 Storage。禁止 Content-Encoding 压缩体，避免解压字节边界歧义。

Account API得到完整有界字节后校验实际大小>0、<=声明、<=当前策略，计算SHA-256，然后重新事务校验Principal、配额及上传租约，最后才上传该不可变缓冲区。BFF与Account API分别限制每实例最多16个并发接收、每账户最多2个接收，在读body前取得接收名额；超过返回429。实际内存仍须在Staging压测，不能仅以文件大小推算总实例内存。中央层独立校验，避免BFF配置错误成为绕过入口。

## 2. 数据与配额

~~~sql
create table public.platform_file_policies (
  platform_id uuid primary key references public.platforms(id) on delete restrict,
  enabled boolean not null default true,
  max_file_bytes bigint not null default 1048576
    check (max_file_bytes between 1 and 1048576),
  max_files integer not null default 10 check (max_files > 0),
  max_total_bytes bigint not null default 10485760 check (max_total_bytes > 0),
  updated_at timestamptz not null default now(),
  check (max_file_bytes <= max_total_bytes)
);

create table public.platform_config_files (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null,
  platform_account_id uuid not null,
  original_name text not null,
  storage_bucket text not null default 'platform-config-files'
    check (storage_bucket = 'platform-config-files'),
  storage_path text not null unique,
  mime_type text,
  purpose text,
  requested_size_bytes bigint not null check (requested_size_bytes between 1 and 1048576),
  actual_size_bytes bigint check (actual_size_bytes between 1 and 1048576),
  sha256 text,
  reserved_bytes bigint not null check (reserved_bytes >= 0),
  reserved_count integer not null default 1 check (reserved_count in (0, 1)),
  status text not null default 'pending'
    check (status in ('pending', 'receiving', 'storing', 'active',
      'deleting', 'deleted', 'failed', 'expired')),
  replaces_file_id uuid,
  intent_expires_at timestamptz not null,
  lease_until timestamptz,
  fencing_token bigint not null default 0,
  write_outcome text not null default 'not_started'
    check (write_outcome in ('not_started', 'in_flight', 'confirmed', 'unknown', 'settled_absent')),
  uploaded_at timestamptz,
  delete_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, platform_account_id, id),
  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id) on delete restrict,
  foreign key (platform_id, platform_account_id, replaces_file_id)
    references public.platform_config_files(platform_id, platform_account_id, id) on delete restrict,
  check (actual_size_bytes is null or actual_size_bytes <= requested_size_bytes),
  check (status <> 'active' or (actual_size_bytes is not null and sha256 is not null)),
  check (replaces_file_id is null or replaces_file_id <> id)
);

create unique index one_live_replacement_per_file
  on public.platform_config_files(replaces_file_id)
  where replaces_file_id is not null and status in ('pending', 'receiving', 'storing');
~~~

表中 reserved_bytes/count 是该行当前仍占用的存储预算，不只表示 pending：pending/receiving 按声明预约；storing 按已验证实际大小；active 按实际大小；deleting 及结果不明的写入继续占用。只有证明没有对象且没有可能迟到的写入，才归零。

配额事务统一锁 platform_account，再锁 file rows（按 UUID 排序）。普通上传要求 SUM(reserved_bytes)+size<=max_total_bytes、SUM(reserved_count)+1<=max_files；任何状态下仍有 reserved 的行都参与计算，不能只统计 active。所有配额变更使用同一函数，状态切换和预算变更同事务。

过期时间只是任务触发条件，不自动从 SUM 排除。降低策略到已占用量以下时保留现有文件，标记 over_quota，禁止新增/Replace，仍允许读取与删除；不能偷偷删除用户数据或释放真实占用。

## 3. 上传接口与状态机

1. POST /v1/config-files/upload-intent：JSON 为 name、size、content_type、purpose、可选 replaces_file_id；需要用户、平台凭据、Idempotency-Key。事务预约配额，创建10分钟有效 pending，返回 file_id、upload_path、expires_at，不返回任何 Storage URL。
2. PUT /v1/config-files/:id/content：application/octet-stream 原始体，通过同源 BFF 与 server SDK 转发；同一 file_id 同时只允许一个接收租约。pending→receiving 后在有界内存接收，收齐前不写 Storage。
3. 收齐后在短事务中重新检查状态、账户、策略、租约；记录实际大小/hash、write attempt，receiving→storing，提交事务后上传独立路径，upsert=false。
4. Storage成功后查询对象大小并校验，账户锁下storing→active，记Audit。若用户在storing后被Suspend，允许已经授权的存储操作结算并保留占用，但后续访问拒绝；若处于Close/Global Delete则转deleting补偿，不重新开放账户。返回文件信息；完成为后端内部步骤，**没有浏览器可调用的 /complete API**。
5. active 的重复 PUT 验证实际字节/hash 与已提交内容一致时返回既有结果；不同内容返回 FILE_CONTENT_CONFLICT；不覆盖对象。请求中断后 GET 文件状态恢复进度，不能盲目生成另一个对象。

接收超时15秒，单次存储调用预算30秒；host 最大请求时限须留出清理和返回余量并在 Staging 验证。上传 worker 不能依赖未持久化的 fire-and-forget。

状态转换：

~~~text
pending → receiving → storing → active → deleting → deleted
pending / receiving → failed 或 expired（确认从未发起存储写入）
storing → active 或 deleting（写入结果确认后完成/补偿）
storing + unknown → 保留预算，由 reconciliation 追踪
~~~

网络超时不等于 Storage 未写入。write_outcome=unknown 时保留预算和墓碑，不因一次 HEAD 不存在而释放、不复用路径，也不启动第二次并发 PUT。恢复任务先确认原写入结果，再验证对象或安排删除；无法证明请求已结算时保留占用并告警转人工，禁止为释放容量猜测失败。

租约 fencing_token 用于拒绝旧 worker 更新数据库；Storage 不支持本系统的 fencing token，不能宣称只靠租约就能阻止迟到对象。所有未结算写入仍计费占用，删除必须等写入确认结算后再执行。

## 4. 满配额 Replace

Replace 固定为新对象验证完成后，在同一数据库事务中将新行 active、旧行 deleting；旧对象物理删除成功后释放其预算。旧对象在新对象成功前始终可用，不覆盖旧路径。

**严格物理配额下，新旧对象并存也必须计入预算。V1 不提供隐藏超额空间。** 即使新文件更小，只要当前剩余字节/对象预算不足，也返回 REPLACEMENT_CAPACITY_REQUIRED，UI 展示所需临时空间和当前余量。

用户可先删除不需要的其他文件并等待删除确认，或让管理员提高策略后重试。不得自动删除被替换的旧文件来腾空间；如果用户主动选择先删除旧文件，则是独立、明确的删除操作，不承诺可恢复旧内容。

替换目标必须为同账户 active 文件；同一目标只允许一个进行中的替换。重复内容上传不重复切换；替换期间对旧文件发起独立删除返回 FILE_BUSY。新文件失败保留旧文件，释放预算前按写入结果处理。

## 5. 下载和删除

GET /v1/config-files/:id/content 经 BFF/Account API 重新校验身份、平台、账户、文件 active 后代理私有对象。Admin 下载额外要求近期 MFA。响应固定 application/octet-stream、Content-Disposition: attachment、X-Content-Type-Options: nosniff、Cache-Control: private, no-store，文件名转义，不提供浏览器直接预览或永久 URL。GET /v1/config-files 使用 `limit`（默认20、最大100）和绑定账户/平台排序的 UUID `cursor`，返回 `items` 与 `next_cursor`；详情至少返回 status、write_outcome、reserved bytes/count、actual size、created/updated。

下载审计区分 download_authorized、download_stream_completed、download_failed；服务端流完成不等于客户端已保存。已经开始的下载不承诺被后续 Suspend 瞬间撤回，新的下载请求必须拒绝。

DELETE /v1/config-files/:id 在事务中标记 deleting 并审计，返回202；任务调用 Storage API remove（禁止直接删 storage.objects metadata），确认对象已删除且没有未结算写入后，同事务置 deleted、释放预算并记录删除完成事件。失败保持 deleting 与占用，指数退避重试；重复 DELETE 返回现有状态。

pending 且未写入可取消并释放；receiving/storing 有租约或未知写入时返回取消已请求，交给同一补偿流程，不能直接归零。已删除路径永不复用。

## 6. 对账与验收

每分钟清理超时意图和重试删除，每小时分批核对对象与记录；租约、重试、告警规则见运维文档。检查 active 对象缺失、孤儿对象、unknown 写入、deleting 积压、预算漂移及已删除行迟到对象。

归属不明对象隔离并人工审核，不能猜测归属后自动删除。active 对象缺失标记不可下载、告警并从对象备份恢复，不把 metadata 当作文件备份。预算修复仍须持有账户锁。

必须验证：20个并发意图不超配额；伪造小size/Content-Length及chunked超限在 Storage 调用前拒绝；0字节/压缩体拒绝；内容与声明不符；两次PUT不同内容；无浏览器Storage写权限；上传中Suspend；满配额Replace拒绝且旧内容完整；存储成功但数据库失败；超时迟到写入仍被预算覆盖；删除失败不释放；租约过期旧worker不得覆盖新状态；跨账户替换FK拒绝。

## 7. M4-01冻结附录：入口、状态和恢复屏障

本节冻结M4实现和M6联合备份之间的公共边界。它只定义受控SQL入口和结果语义，不代表这些函数、表或任务已经实现；M4-02起按此合同追加迁移，不能由HTTP层自行拼接第二套配额或删除算法。

### 7.1 领域SQL入口

所有入口位于 `private`，由对应executor经固定 context 调用；普通运行时不获得文件表、备份屏障或Storage metadata的直接DML权限。函数内部先验证context、平台/账户/身份门闩，再按“账户锁→相关文件UUID升序锁→状态/预算更新”的顺序执行。

| 入口 | 调用者与输入 | 成功结果/事务职责 | 幂等、状态和拒绝 |
|---|---|---|---|
| `file_intent_create(ctx, request, idem_key)` | account executor；name、声明size、content_type、purpose、optional replace id | 新file_id、不可复用object path、expires_at、reserved bytes/count；创建pending并写Audit/幂等 | 同key同请求返回原结果，异请求409；策略/账户/门闩/预算/并发意图不满足时拒绝 |
| `file_receive_claim(ctx, file_id, owner, fence)` | account executor；重新认证的账户context、file_id、worker owner | pending→receiving，写lease/fence；不改变已结算预算 | 非pending、过期、已有有效租约、跨账户或旧fence拒绝；不因超时自动归零 |
| `file_prepare_store(ctx, file_id, actual_size, sha256, idem_key)` | account executor；有界接收完成后的实际size/hash | receiving→storing，创建唯一未结算write attempt并按actual调整reserved bytes | size/hash/策略/门闩不符拒绝；同key同内容返回原attempt，异内容409；事务不等待Storage |
| `file_write_attempt_settle(job_ctx, attempt_id, outcome, evidence)` | account/job recovery executor；trusted adapter结果、provider request id、size/hash | confirmed后storing→active，settled_absent后进入可清理状态；记录证据和Audit | in_flight/unknown不得由客户端改写；旧fence、错误file或重复矛盾结果拒绝；unknown持续占用 |
| `file_delete_request(ctx, file_id, idem_key)` | account executor；用户文件id | 无写入的pending/receiving可直接expired/deleted并释放；其他状态标记deleting并返回现有状态；不在请求事务调用Storage | 重复请求返回现有状态；未知写入、Replace、Close/backup屏障返回处理中或FILE_BUSY，不释放预算 |
| `file_cleanup_candidates(cursor, limit)` | job executor；UUID游标/固定批量上限 | 返回到期、deleting或待结算的固定候选，不改变状态 | 不接受任意表名/SQL；仅返回受控文件id和调度时间 |
| `file_cleanup_claim(job_ctx, file_id, lease_seconds)` | job executor；受控候选文件 | 复用job lease/fence；无写入过期、备份屏障或待结算分别返回受控动作；可删除对象时持有lease到finish | unknown/in-flight不释放预算或启动第二次PUT；旧/忙租约不能执行 |
| `file_cleanup_finish(job_ctx, file_id, fence, outcome, error)` | job executor；可信Storage remove结果 | remove确认后deleted并归零；失败/unknown按1分钟起、1小时上限退避，预算保持 | 旧fence拒绝；10次失败转人工告警；Storage调用不在DB事务内 |
| `file_reconcile_step(job_ctx, cursor, limit)` | job executor；固定UUID游标/批量上限 | 分页核对active缺失、孤儿、unknown、deleting、预算漂移并产生告警事件 | 只接受有效context和固定游标；不接受任意表名/SQL；归属不明进入人工队列 |
| `file_backup_barrier_begin(job_ctx, snapshot_id)` / `file_backup_barrier_finish(job_ctx, snapshot_id, result)` | job/recovery executor；外部恢复集标识 | 持久化屏障scope、snapshot、lease、manifest状态；finish仅能提交完整/失败结果 | 2小时内未完成先将恢复集标记failed再解除；没有完整active对象清单不能标success |

### 7.2 `status` 与 `write_outcome` 分离

`status` 表示文件业务生命周期，允许集合为 `pending`、`receiving`、`storing`、`active`、`deleting`、`deleted`、`failed`、`expired`；`write_outcome` 表示Storage写入事实，允许集合为 `not_started`、`in_flight`、`confirmed`、`unknown`、`settled_absent`。`unknown`不是失败，也不能通过任务重试、HEAD 404或租约过期推断为不存在。

客户端只能触发意图、受控接收和删除请求；不能提交 `status`、`write_outcome`、reserved bytes、fence、provider request id、实际hash或checkpoint。所有响应至少包含file_id、status、write_outcome、reserved bytes、actual size（可空）、created/updated时间和可安全展示的错误码；不会返回Storage URL、Secret或原始metadata。

文件名只作为受限metadata保存：拒绝NUL、控制字符、超过合同长度或无法规范化的输入；下载时使用安全的 `Content-Disposition` 编码。purpose/content type/metadata均有固定长度和对象结构上限，未知字段拒绝，不接受无界JSON。

### 7.3 M4/M6共享备份删除屏障和墓碑

删除任务在调用Storage remove前必须检查最新的持久屏障：`barrier_id`、`scope`、`recovery_set_id`、`state`（active/running/complete/failed）、`lease_owner`、`fencing_token`、`started_at`、`deadline_at`、`manifest_version`和`last_error_code`。`active`或未结算写入对象缺少manifest记录时，屏障不能进入complete；屏障超时先写failed，再按同一有效fence解除删除阻塞并告警。

删除墓碑只保存恢复所需的非Secret最小字段：`tombstone_id`、`operation_id`、`platform_id`、脱敏后的账户/文件引用、对象path hash、原状态、删除请求/确认时间、原因分类、数据版本和来源commit/manifest版本。不得保存原始文件名、文件内容、access/refresh token、Platform Key、兑换码、SQL密码、IP/UA或自由文本。

M4将屏障消费和墓碑事件写入主库的受控过程；M6负责把manifest和墓碑复制到主库之外的独立恢复介质，并在恢复时重新应用。没有M6外部介质时，只能运行屏障故障注入和隔离模拟，不能宣称联合备份或G6通过。

### 7.4 HTTP/SDK映射冻结

Account侧只保留现有六个文件操作：`POST /v1/config-files/upload-intent`、`PUT/GET /v1/config-files/{fileId}/content`、`GET /v1/config-files`、`GET/DELETE /v1/config-files/{fileId}`；不增加浏览器 `complete`、signed-upload或Storage直连路径。Admin侧的file-policy、files、deletion-jobs列表/详情/下载/受控delete/retry均必须调用同一领域入口；M4-08再提供页面，不能在UI中重算预算或直接写表。

HTTP 202只表示已接受或删除处理中，不表示对象已删除或预算已释放。分页默认20、上限100，游标绑定平台/过滤条件和排序；请求错误携带request_id，响应统一no-store。Admin 文件列表支持可选精确 `platform_id`：过滤在服务端游标分页前执行；无效 UUID 返回400、未知平台返回404、与平台范围不一致的 cursor 返回400 `INVALID_INPUT`。不带该参数仍保留全局列表语义。M4-02～M4-07若需要变更字段，必须先同步本节、`docs/development/contracts.md`、OpenAPI、DTO、SDK和测试，不能静默改名。
