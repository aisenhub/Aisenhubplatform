# OPT-007 配置资源系统

状态：In Progress

关联：[总计划](plan.md) · [优化事项总清单](../optimization-intake/README.md) · [预研架构](../optimization-intake/config-resource-system-architecture.md) · [Files / Jobs 架构](../../architecture/modules/files-jobs.md) · [新平台接入手册](../../guides/platform-onboarding.md)

## 背景与最新事实基线

正式实施基线为 `main@ec997111969c6abfda42f57abd179e6fc0bdfb8e`，任务分支为 `codex/opt-007-config-resource-system`。

现有 `config-files` 已经是成熟的**私有 Storage 文件状态机**，但还不是 Config 业务资源：

- `public.platform_config_files` 负责 pending / receiving / storing / active / deleting / deleted / failed / expired、write outcome、租约、fencing、replace、unknown outcome 与异步清理。
- `public.platform_file_policies` 当前提供单文件上限以及**账户级**文件数/总字节限制。
- Account v1 已冻结六个 `/v1/config-files...` operation，Consumer Harness 直接依赖，不能在 v1 中原地删除或改名。
- Storage bucket `platform-config-files` 是 private；浏览器不直连 Storage，上传/下载由 Account API 受控转发。
- 文件删除参与 backup barrier、tombstone、Global Delete 与 retention cleanup；当前仓库没有可证明真实外部对象备份已经存在的 worker/manifest 实现。
- Admin `/files` 当前是文件状态/策略/下载/删除运维页；平台 Overview 的“配置广场审核”仍是 OPT-007 planned card。
- `plans.features` 与 Entitlement `features` 已能携带任意 JSON object，但 Admin Plan UI 当前没有 features 编辑字段；因此 `config_slot_limit` 不能依赖人工 JSON 注入。
- `private.rate_limit_consume` 已提供受控数据库限流窗口，不需要新造通用限流设施。

Supabase 当前安全基线继续保持：public schema 新表启用并 force RLS；运行角色不直接访问表；需要提权的业务函数放在 `private`、固定 `search_path`、显式检查上下文并收窄 execute；private Storage 不因 Gallery 改成 public。

## 产品目标

1. 把用户私有“文件”升级为单平台内的 **Config + immutable Version** 业务资源。
2. 用户拥有“我的配置”；创建 Config 后可以持续发布不可变版本，版本内容仍进入现有 private Storage 状态机。
3. 用户可把某个已完成 Version 提交到“配置广场审核”；只有 Admin 批准的指定 Version 才公开展示。
4. 新版本待审核期间，Gallery 继续展示最后一个已批准 Version，不自动切换。
5. Gallery 支持点赞、下载与“一键应用交付”；中央只统计自己能证明的下载完成/应用内容交付，不宣称目标平台真正应用成功。
6. Admin 平台工作区提供配置资源池、审核队列、Gallery 治理与技术 Storage 状态；Platform Overview 接入真实 Pending Review 聚合。
7. Global 平台目录提供平台总 Storage 容量分配；Platform scope 只展示容量事实和业务资源，不重新混入 Global 导航。
8. Global Delete / retention cleanup 能立即停止作者公开内容，并继续沿用现有文件物理删除、backup barrier 与 unknown-outcome 语义。

## 兼容迁移原则

### 保留 canonical `/v1/config-files`

Account v1 现有六个文件 operation 全部保留，其 wire contract 不做 breaking change。现有行视为 `legacy` 文件；新 Config Version 使用同一文件表的 `config_version` 资源类别。

旧接口只读写 `legacy` 行；新 `/v1/configs...` / `/v1/config-gallery...` 只通过 Config 领域函数创建和访问 `config_version` 行。这样旧 Consumer 不会突然看到新业务 Version，也不会让新业务绕过 Config ownership / Gallery admission。

### 共用一个物理容量事实

`platform_config_files` 继续是所有对象的物理 Storage ledger。`platform_file_policies` 新增平台总容量字段；**legacy 和 config_version 都计入同一平台 reserved/actual 总量**。

旧接口仍保留账户级 `max_files` / `max_total_bytes` 兼容限制，同时也受平台总容量上限约束；新 Config 业务不再把账户级文件数当作品槽位，而是使用 Entitlement `config_slot_limit`。

这不是两套互相矛盾的物理配额：平台总容量是所有文件共同的硬上限；旧账户配额只是 legacy surface 的额外兼容 fence。

## 数据模型

### `public.platform_configs`

Config 是用户拥有的作品身份，不等于文件：

- `id`, `platform_id`, `platform_account_id`
- `title`：1–120 字符；`description`：可空，最多 2000 字符
- `status`: `active | deleting | deleted`
- `current_version_id`: 当前作者版本；只有内容完成并被 Storage ledger 证明 active/confirmed 后才能推进
- `row_version`：metadata 并发控制
- `delete_requested_at`, `deleted_at`, `created_at`, `updated_at`

槽位统计全部 `status = active` 的 Config，与是否提交/进入 Gallery 无关，避免通过反复上下架绕过套餐额度。

### `public.platform_config_versions`

Version 创建后不可修改：

- `id`, `platform_id`, `platform_account_id`, `config_id`
- `file_id`：唯一关联 `platform_config_files` 的 `config_version` 行
- `version_number`：Config 内单调递增
- `schema_key`, `schema_version`：中央只保存平台声明的格式身份，不解析业务 payload
- `changelog`：可空，最多 2000 字符
- `created_at`

V1 **不自动清理历史版本**，也不后台猜测“过旧版本”。版本增长由上传限流与平台总容量硬上限控制；未来如要引入自动 retention，必须作为独立数据保留变更。

### Gallery：Submission 与 Entry 分离

`public.platform_config_gallery_submissions` 是审核历史：

- 每次提交绑定一个 immutable Version。
- 状态 `pending | approved | rejected | cancelled`。
- 同一 Config 最多一个 pending submission。
- 保存提交时间、审核时间、Admin、审核原因。

`public.platform_config_gallery_entries` 是**当前公开可见事实**：

- 每个 Config 最多一行。
- `published_version_id` 指向当前批准的 immutable Version。
- 状态 `approved | removed | blocked`。
- 新 Version 提交为 pending 时不改变现有 Entry；Admin 批准后才原子切换 `published_version_id`。
- `removed` 是可恢复的运营下架；`blocked` 是治理阻断。两者都不修改/删除作者个人 Config。

### Likes 与 Usage events

`public.platform_config_likes` 使用 `(platform_id, config_id, platform_account_id)` 唯一关系；Like 只能作用于当前 `approved` Gallery Entry。

`public.platform_config_usage_events` 保存中央可证明的事件：

- `download_completed`：Gallery 内容流成功完成后记录。
- `apply_delivery_completed`：一键应用请求的内容由中央成功交付给 Consumer BFF 后记录。
- 事件包含 Config、published Version、可空 actor account、request/idempotency event key 与时间。
- 列表中的下载/应用次数由事件聚合或可重建投影产生，浏览器不能直接提交计数。

“应用量”**不表示目标平台业务应用成功**；只有未来存在可信 Consumer result contract 时才可新增该语义。

## 权益、容量与降级

### Config 槽位

Plan `features.config_slot_limit` 冻结为 `0..1000` 的整数：

- 缺失、非数字、非整数或越界时服务端按 `0` fail closed。
- 新建 Config 时读取当前有效 Entitlement；`active Config count < config_slot_limit` 才允许创建。
- 套餐降级后若已有 Config 数超过新额度：禁止创建新 Config，但允许修改 metadata、为已有 Config 上传修复/升级 Version、提交审核或删除 Config。
- Admin Plan 编辑器增加专用“配置槽位”数字输入，并保留其他 feature keys；SQL 同时做强校验，不能只信 UI。

### 平台物理容量

扩展 `platform_file_policies`：

- `max_platform_total_bytes`：平台所有 legacy + config_version reserved bytes 的硬上限；初始默认 1 GiB。
- 现有 `max_file_bytes` 继续作为单对象硬上限。
- `max_files` / `max_total_bytes` 保留 legacy Account v1 兼容含义。

平台总容量只在 **Global 平台目录**提供显式分配入口；Platform scope 展示已用/已预约/总容量，但不把 Global 治理入口塞回 Platform Sidebar。下调容量不会自动删除既有内容；超额时只阻止新的物理预约。

## Account v1 增量合同

在保留 `/v1/config-files` 的同时新增：

### 我的配置

- `GET /v1/configs`
- `POST /v1/configs`
- `GET /v1/configs/{configId}`
- `PATCH /v1/configs/{configId}`（ETag / `If-Match`）
- `DELETE /v1/configs/{configId}`（异步删除语义）
- `GET /v1/configs/{configId}/versions`
- `POST /v1/configs/{configId}/versions/upload-intent`
- `PUT /v1/configs/{configId}/versions/{versionId}/content`
- `GET /v1/configs/{configId}/versions/{versionId}/content`
- `POST /v1/configs/{configId}/gallery-submissions`

Version upload-intent 与 content PUT 复用既有文件预约、Storage write attempt、unknown outcome 和 finalize 机制；只有 finalize 后才更新 Config `current_version_id`。

### 配置广场

- `GET /v1/config-gallery`
- `GET /v1/config-gallery/{configId}`
- `PUT /v1/config-gallery/{configId}/like`
- `DELETE /v1/config-gallery/{configId}/like`
- `GET /v1/config-gallery/{configId}/content`
- `POST /v1/config-gallery/{configId}/apply`

Gallery 读取永远解析 `entry.published_version_id`，并要求 Entry approved、Config active、作者账户 active、底层文件 active/confirmed。移出/阻断、作者账户关闭或文件不可下载时 fail closed。

`POST .../apply` 要求 Idempotency-Key；它返回批准版本的二进制内容，重复 key 可以再次安全交付但 usage event 必须去重。

## 限流与滥用控制

复用 `private.rate_limit_consume`，key 至少绑定 `platform_id + platform_account_id + action`。V1 冻结：

- Config/Version 创建：每账户每平台 60 次/小时。
- Gallery submission：20 次/天。
- Like/Unlike：240 次/小时。
- Gallery download + apply delivery：600 次/小时。

标题/说明/schema/changelog 做长度和控制字符校验；payload 安全仍以真实 bytes、private Storage、受控 BFF 和平台自己的 schema parser 为准。Content-Type 不能作为可信执行判断。

## Admin 与信息架构

### Platform scope：配置资源

现有 `/admin/platforms/:platformId/files` 导航标签改为“配置资源”，主视图变成：

1. 资源池：作者、当前 Version、个人状态、Gallery 状态、Likes/Downloads/Apply deliveries、更新时间。
2. Pending Review：待审核 Version、作者、schema、提交时间；批准/拒绝使用明确确认并写审计。
3. Gallery 治理：remove / restore / block；这些动作只影响 Entry，不删除个人 Config。
4. Storage 状态：保留现有文件 policy/ledger/unknown-outcome/技术 Inspector 作为次级诊断区，不丢失成熟运维能力。

### Platform Overview

扩展 `private.admin_platform_overview`，新增 `pending_config_reviews` 权威字段。原 planned card 改为真实 MetricCard 并深链到配置资源审核队列；数据源不可用时仍按页面既有 fail-closed 规则处理，不显示假 0。

### Global scope：容量分配

`/admin/platforms` 的平台行增加“存储容量”治理入口，读取当前平台 policy、reserved/actual 使用量，并允许修改 `max_platform_total_bytes`。减小到当前已用以下允许保存但明确进入 over-capacity 状态，后续新预约被服务端拒绝；不自动删除对象。

## 删除、关闭与隐私

### 用户主动删除 Config

删除请求原子执行：

1. Config → `deleting`。
2. 当前 Gallery Entry → `removed`；pending submissions → `cancelled`。
3. 该 Config 所有 Version 的 file ledger → `deleting`，继续由现有 cleanup/tombstone/backup barrier 物理结算。
4. 当所有 Version file 都到 `deleted` 后，由 cleanup reconciliation 把 Config → `deleted`。

删除中不释放 reserved bytes，直到现有文件结算真正释放预算。

### Global Delete / retention cleanup

在现有 `files_blocked` / retention cleanup 中同时：

- 立即停止该作者所有 Gallery Entry。
- cancel pending submissions，Config 标记 deleting。
- 删除该账户作为“点赞者”的 Like 关系。
- Usage event 的 actor account 置空，保留不可反推身份的聚合事实。
- 清理 Config title/description 与 Version changelog 等用户提供文本。
- 继续让现有 file ledger 负责私有 Storage 对象删除。

Gallery 查询还必须 join 作者账户 `status = active`，因此账户关闭后即使后台物理清理尚未完成，也不会继续公开作品。

## 备份与恢复真值

本项只扩展现有 backup barrier/删除屏障覆盖范围，并在文档中列出 Config / Version / Gallery / Likes / Usage events 的恢复数据集。当前仓库没有真实外部对象备份/manifest worker，因此 Admin **不得**显示“已备份”或最近成功备份时间。

数据库托管备份也不能替代 Storage Object 备份；外部对象备份与恢复演练仍是后续独立工作。

## 风险分级

**R3**。

本项同时变更 public schema、private security-definer functions、Storage 写入/下载路径、Account/Admin OpenAPI、Consumer Harness、Global Delete/retention、Admin 高风险治理和平台配额。每个 Supabase phase 必须：

1. Local fresh/upgrade SQL 与权限测试通过。
2. Account/Admin API tests 与受影响 browser/Consumer E2E 通过。
3. 合同兼容检查无 breaking change。
4. 同步授权 staging (`workendstaging`) 并验证迁移、函数权限和 Edge 版本；staging 不能替代 Local R3。
5. Production 未获本任务授权，不部署 Production。

## 明确排除

- 不实现 OPT-008 用户反馈/截图上传。
- 不实现跨平台 Gallery；所有 Config/Gallery 都严格单平台。
- 不让中央解析或执行平台业务 Config payload。
- 不把 Storage bucket 改 public，不发永久对象 URL。
- 不用浏览器上报的“下载数/应用成功”直接改 counter。
- 不自动迁移既有 legacy config-files 为 Config；无法证明作品关系的历史文件继续保持 legacy 私有文件。
- 不实现“作者删除后匿名保留作品”；未有产品/隐私决定前按删除处理。
- 不宣称已有外部 Storage 备份或恢复演练。

## 验收

- 旧 `/v1/config-files` 六个 operation 与 Consumer Harness 继续兼容。
- Config slot、平台总容量、版本上传均由服务端权威约束；降级不删除数据。
- Version immutable；Gallery 只指向批准 Version；新 pending 不覆盖旧批准版本。
- remove/block 与个人 Config 删除完全分离。
- Like 唯一，下载/应用统计来自中央事件事实。
- Global Delete/retention 能停止公开访问、匿名化互动并最终删除底层文件。
- Platform Overview 显示真实 pending review 指标。
- Admin 主视图业务可读，原 Storage 技术状态仍可诊断。
- Account/Admin OpenAPI、Consumer Harness、Local Supabase、Admin browser、docs/contracts 与 canonical R3 全绿。
