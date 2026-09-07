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

GET /v1/config-files/:id/content 经 BFF/Account API 重新校验身份、平台、账户、文件 active 后代理私有对象。Admin 下载额外要求近期 MFA。响应固定 application/octet-stream、Content-Disposition: attachment、X-Content-Type-Options: nosniff、Cache-Control: private, no-store，文件名转义，不提供浏览器直接预览或永久 URL。

下载审计区分 download_authorized、download_stream_completed、download_failed；服务端流完成不等于客户端已保存。已经开始的下载不承诺被后续 Suspend 瞬间撤回，新的下载请求必须拒绝。

DELETE /v1/config-files/:id 在事务中标记 deleting 并审计，返回202；任务调用 Storage API remove（禁止直接删 storage.objects metadata），确认对象已删除且没有未结算写入后，同事务置 deleted、释放预算并记录删除完成事件。失败保持 deleting 与占用，指数退避重试；重复 DELETE 返回现有状态。

pending 且未写入可取消并释放；receiving/storing 有租约或未知写入时返回取消已请求，交给同一补偿流程，不能直接归零。已删除路径永不复用。

## 6. 对账与验收

每分钟清理超时意图和重试删除，每小时分批核对对象与记录；租约、重试、告警规则见运维文档。检查 active 对象缺失、孤儿对象、unknown 写入、deleting 积压、预算漂移及已删除行迟到对象。

归属不明对象隔离并人工审核，不能猜测归属后自动删除。active 对象缺失标记不可下载、告警并从对象备份恢复，不把 metadata 当作文件备份。预算修复仍须持有账户锁。

必须验证：20个并发意图不超配额；伪造小size/Content-Length及chunked超限在 Storage 调用前拒绝；0字节/压缩体拒绝；内容与声明不符；两次PUT不同内容；无浏览器Storage写权限；上传中Suspend；满配额Replace拒绝且旧内容完整；存储成功但数据库失败；超时迟到写入仍被预算覆盖；删除失败不释放；租约过期旧worker不得覆盖新状态；跨账户替换FK拒绝。
