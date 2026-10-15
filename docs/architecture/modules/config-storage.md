# Config、Version、Gallery 与 Storage 架构

Config 是用户可管理的业务资源；Storage file 是 Config Version 的内部物理对象状态机。当前产品面不再暴露 generic legacy file CRUD。

## Requirements

本模块主要承担 [Config 与 Storage 需求](../../spec/config-storage.md) `REQ-CFG-001` ～ `REQ-CFG-010`，并共同满足 `REQ-SYS-001`、`REQ-SYS-002`、`REQ-SYS-004` ～ `REQ-SYS-006`、`REQ-SYS-008`、`REQ-SYS-009`。

## 1. 领域层次

```text
Config
  └─ immutable Config Version
       └─ private Storage ledger/file

Config Version
  └─ Gallery Submission
       └─ approved Gallery Entry
            ├─ Like
            └─ Usage Event
```

业务对象与物理对象分层是本模块的核心：不能用一条 Storage row 代替 Config，也不能另造第二套文件生命周期。

## 2. Config

`public.platform_configs`：

- platform/account owner；
- title 1–120；
- description <= 2000；
- `status: active | deleting | deleted`；
- `current_version_id`；
- `row_version`；
- delete timestamps；
- create/update timestamps。

Config slot 统计 active Config，而不是文件数。slot entitlement 属于 Plan feature，物理容量属于 platform file policy。

## 3. Immutable Version

`public.platform_config_versions`：

- platform/account/config；
-唯一 `file_id`；
-单调 version number；
- schema key/version；
- changelog；
- created time。

Version 创建后内容和版本身份不可原地更新。新内容创建新 Version。

中央只保存平台声明的 `schema_key/schema_version`；不解析、不执行、不预览、不解压用户 Config payload。

## 4. 物理 Storage Ledger

`public.platform_config_files` 当前 `resource_kind` 只能是 `config_version`。关键状态：

`pending -> receiving -> storing -> active -> deleting -> deleted`

受控失败/过期：

`pending/receiving -> failed | expired`

独立 `write_outcome`：

`not_started | in_flight | confirmed | unknown | settled_absent`

`status` 与 `write_outcome` 不能合并。网络 timeout 不等于 Storage 没写入；`unknown` 必须继续占用容量直到能够证明结果。

## 5. 上传限制

Config Version 单对象当前硬上限 1 MiB。上传链：

```text
Browser
 -> Consumer same-origin BFF
 -> Account API bounded reader
 -> validate actual bytes/hash/quota/lease
 -> private Storage
```

约束：

- 浏览器不获得 Storage write credential 或 signed upload URL；
- Content-Length/MIME/文件名都不作为可信授权事实；
- 有界读取后计算真实大小和 SHA-256；
- 非 identity Content-Encoding 拒绝；
- Storage 写入前再次校验 account/platform/policy/lease；
- object path 永不复用；
- binary upload 不自动重放。

## 6. 容量模型

`public.platform_file_policies` 当前包含：

- enabled；
- `max_file_bytes <= 1 MiB`；
- `max_platform_total_bytes`，范围 1 MiB–1 TiB；
- updated time。

Config 业务限制由两层共同决定：

1. entitlement `config_slot_limit`：能创建多少 active Config；
2. platform physical storage quota：所有 Version 实际/保留字节总量。

`reserved_bytes` 在 pending/receiving/storing/active/deleting/unknown 等仍有物理风险的状态都可占用预算。只有证明对象不存在且没有迟到写入风险才释放。

### Slot 降级语义

`config_slot_limit` 限制的是**新建 active Config**，不是既有 Config 的 Version 数量。当前 SQL 回归明确覆盖：账户已经有 Config 后，即使有效 Plan 的 `config_slot_limit` 被降到 `0`，仍允许给这个既有 active Config 创建下一 Version；但新建超额 Config 继续返回 `config_slot_limit_exceeded`。因此套餐降级不会自动删 Config，也不会阻止用户维护既有 Config。

Version 增长仍受另一组独立保护：每次 Version intent 都检查单对象上限、平台总 Storage 预算，并执行 `config_version_create` 固定窗口限流（当前每账户/平台作用域每小时 60 次）。这不是套餐 slot 的替代物。

## 7. Upload Intent 与结算

`POST /v1/configs/{configId}/versions/upload-intent` 在事务中创建 Version + file intent；返回受控 content path，不返回 Storage URL。

PUT content：

1. claim receiving lease/fence；
2. 有界读取完整 bytes；
3. 重新校验并记录实际 size/hash；
4. 短事务 `receiving -> storing`；
5. 事务外写 Storage；
6. 验证对象；
7. 新事务 `storing -> active` 并推进 Config current version。

若外部写成功但数据库 finish 不确定，保留 `unknown` 并交由 reconciliation，不启动第二个并发 PUT。

## 8. Gallery 审核

`platform_config_gallery_submissions` 保存审核历史：

`pending | approved | rejected | cancelled`

同一 Config 最多一个 pending submission。Submission 绑定 immutable Version。

`platform_config_gallery_entries` 保存当前公开事实：

`approved | removed | blocked`

Entry 指向明确 `published_version_id`。作者上传新 Version 不会自动替换 Gallery 已批准版本；必须重新提交并批准。

Admin “移出/阻止 Gallery”不能删除用户个人 Config。

### Gallery 作者与可见性

Gallery 不保存一份独立的“作者用户名”作为长期真相。当前 list/read 在读取时通过 Config owner 的 `platform_account_id` 关联当前 `platform_profiles.display_name`，所以改名后 Gallery 展示会跟随当前 Profile；稳定归属仍是 Platform Account/Config ID。

Gallery 可见性同时要求：Entry `approved`、Config `active`、作者 Platform Account `active`、目标 published Version 的底层 file `active` 且 `write_outcome=confirmed`。作者账户被 suspend/close、Config 删除或底层对象未确认时，不应仅因为 Gallery Entry 仍是 approved 就继续公开。

### Schema compatibility 边界

中央合同当前保存并返回 `schema_key` 与 `schema_version`，但**没有中央 app-version compatibility range，也不解析/迁移 payload**。Consumer 在下载/一键应用前负责判断自己是否认识该 schema/version、payload 是否适用于当前应用以及应用动作是否安全。中央 `apply_delivery_completed` 仍只表示内容交付完成，不证明 Consumer 已成功解释或应用配置。

## 9. Like 与 Usage

`platform_config_likes` 表达账户对当前平台 Config 的幂等 Like。

`platform_config_usage_events` 当前只记录中央能证明的：

- `download_completed`；
- `apply_delivery_completed`。

`apply_delivery_completed` 只证明 Aisenhub 成功交付内容，不证明目标应用已真正应用配置。

## 10. 下载

Owner Version、Gallery content/apply 都由 Account API 每次重新验证：

- Principal；
- platform/account ownership；
- Config/Version 状态；
- Gallery visibility；
- underlying file active/confirmed。

返回二进制 + no-store + 安全 Content-Disposition。浏览器从不获得 private Storage URL。

## 11. 删除与清理

Config delete：

1. Config -> deleting；
2. 立即从 Gallery 隐藏并取消 pending submission；
3. 所有 Version file -> deleting；
4. Maintenance 调 Storage remove；
5. 只有对象删除得到确认且无未结算 write，file 才 -> deleted 并释放预算；
6. 所有 Version 物理对象清理完成后 Config 收敛 deleted。

不能“删数据库行”冒充对象已删除。

## 12. Lease、Fencing、Reconciliation

File row 和 write-attempt ledger 保存 lease owner/until、fencing token、retry/next attempt/error。旧 worker 的 fence 不允许提交新状态。

注意：DB fencing 不能取消已经发往 Storage 的外部写请求。因此 `unknown` 仍需要保留路径和预算，不能因为 lease 过期或一次 HEAD 404 就认定写入不存在。

Maintenance：

- file cleanup：每分钟候选；
- file reconcile：每小时；
- retry 指数退避；
- 归属不明对象进入人工处理，不猜测后删除。

## 13. Backup Barrier

Config/Feedback 物理删除共享 `private.file_backup_barriers`。删除前必须尊重 active recovery set barrier。

数据库备份不包含 Storage object bytes。没有真实外部 object backup/manifest 介质时，任何 Admin UI/文档都不能把数据库 metadata 宣称为“文件已备份”。

删除墓碑只保留恢复必要的脱敏最小字段，不保存原始内容、文件名、Token、Key、Code、IP/UA 或自由文本。

## 14. Global Delete / Retention

身份清理会：

- 立即停止作者 Gallery 可见性；
- Config -> deleting；
- 删除目标账户 Like；
- usage actor 最小化；
- Config/Version 用户文本按隐私策略清理；
- 物理对象继续走同一 file cleanup，而不是另造删除通道。

## 15. 接口

Account v1 当前包含 Config + Gallery 共 16 个 operation 左右的主要资源面，具体以 OpenAPI 40 operation 总集为准，包括 Config CRUD/versions/content/submission 和 Gallery list/detail/like/content/apply。

Admin 包含 config-resources、detail、usage、config-reviews、review、gallery governance、file-policy。

## 16. 关键验证

必须覆盖：

- slot/quota；
- 并发 intent 不超配；
- 伪造 size/chunked 超限；
- 不同 bytes 重复 PUT 冲突；
- Storage 成功但 DB finish 失败；
- unknown write 不释放；
- stale fence；
- Gallery pending/approved 版本隔离；
- delete + backup barrier；
- Global Delete；
- 浏览器无法直接写 Storage。

实现入口：`account-api/configs.ts`、`files.ts`、maintenance `files.ts`、canonical migration、Admin config feature、Consumer Harness。
