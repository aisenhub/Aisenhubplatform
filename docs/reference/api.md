# HTTP、Consumer Conformance 与 API 合同

本文件描述当前 API、Consumer conformance 与 Admin 集成合同。整体边界见 [系统架构](../architecture/overview.md)。Canonical OpenAPI 3.1 合同位于 [Account](../../contracts/account/v1/openapi.json) 和 [Admin](../../contracts/admin/v1/openapi.json)；`packages/domain/src/contracts` 是中央内部类型源，不是 Consumer runtime 依赖。Consumer/Admin BFF 必须遵守同一 wire contract，不能各自复制领域规则。

## 1. 调用和权限矩阵

Central API路径以 /v1 为前缀；Edge部署的 /functions/v1/account-api 外层前缀属于部署地址，不进入业务合同。Platform Key在X-Platform-Key中传递；用户access token在Authorization: Bearer中传递，禁止放入URL。platformId 由服务端 Key 映射确定，Consumer 不提交可覆盖归属的 platform 标识。

| 方法与路径 | 用户条件 | 平台凭据 | 说明 |
|---|---|---|---|
| GET /v1/plans | 不需要用户；不建立账户 | 必需、平台active | 仅公开active套餐字段 |
| GET /v1/commerce/offers | 不需要用户；不建立账户 | 必需、平台active | Offer、immutable Price 与明确的 purchasable reason；无 verified Provider mapping 时不可购买 |
| POST /v1/subscription/checkout | active账户 | 必需、平台active、未暂停购买 | 仅提交 offer_id 和 Idempotency-Key；服务端锁定价格/期限快照；无verified Provider mapping时返回CHECKOUT_UNAVAILABLE；购买暂停时返回PURCHASES_PAUSED |
| GET /v1/subscription/checkout/:id | active账户 | 必需、平台active | 只读自身结账状态；不返回Provider ID、token或Secret，始终no-store |
| GET /v1/account/principal | 有效用户/会话 | 必需 | 可返回not_activated/suspended/closed/disabled状态供界面提示 |
| POST /v1/account/activate | 有效用户、非Admin、非deleting | 必需、平台active | 仅首次需要allow_activation |
| POST /v1/auth/recent-proof | 当前业务会话 + 独立 email `token_hash` 事件会话 | 必需、平台active | Consumer BFF 在服务端注入 Platform Key；中央服务校验同user、独立事件session及5分钟窗口，仅签发绑定原业务session的proof |
| POST /v1/account/close | active或suspended用户、近期重新认证 | 必需、平台active | 幂等关闭；closed返回既有状态 |
| GET /v1/profile | active账户 | 必需、平台active | 自身资料 |
| PATCH /v1/profile | active账户 | 必需、平台active | 白名单字段更新 |
| GET /v1/preferences | active账户 | 必需、平台active | 自身偏好 |
| PATCH /v1/preferences | active账户 | 必需、平台active | JSON Merge Patch |
| GET /v1/subscription | active账户 | 必需、平台active | 标准权益；权益暂停可返回suspended且features={} |
| POST /v1/subscription/redeem | active账户、权益未暂停 | 必需、平台active | Idempotency-Key必填 |
| GET /v1/configs | active账户 | 必需、平台active | 自身 Config 列表；slot 由 entitlement `config_slot_limit` 服务端强约束 |
| POST /v1/configs | active账户 | 必需、平台active | 创建业务 Config，不创建第二套 Storage ledger |
| GET /v1/configs/:configId | active账户 | 必需、平台active | 只读自身 Config；跨账户统一 404 |
| PATCH /v1/configs/:configId | active账户 | 必需、平台active | `If-Match` 乐观并发；仅 title/description |
| DELETE /v1/configs/:configId | active账户 | 必需、平台active | 202；立即移出 Gallery/取消 pending review，Version files 进入原 file cleanup |
| GET /v1/configs/:configId/versions | active账户 | 必需、平台active | 自身 immutable Version 列表 |
| POST /v1/configs/:configId/versions/upload-intent | active账户 | 必需、平台active | 创建 Version 与 private Storage 上传意图；受账户/平台容量约束 |
| PUT /v1/configs/:configId/versions/:versionId/content | active账户 | 必需、平台active | 有界原始字节；复用 file write/unknown/recovery 状态机 |
| GET /v1/configs/:configId/versions/:versionId/content | active账户 | 必需、平台active | 授权下载自身 Version bytes |
| POST /v1/configs/:configId/gallery-submissions | active账户 | 必需、平台active | 仅 ready immutable Version 可提交；已有 pending 时拒绝 |
| GET /v1/config-gallery | active账户 | 必需、平台active | 仅同平台 Admin-approved entry，且作者账户必须 active |
| GET /v1/config-gallery/:configId | active账户 | 必需、平台active | approved Gallery detail |
| PUT /v1/config-gallery/:configId/like | active账户 | 必需、平台active | 幂等 Like |
| DELETE /v1/config-gallery/:configId/like | active账户 | 必需、平台active | 幂等 Unlike |
| GET /v1/config-gallery/:configId/content | active账户 | 必需、平台active | 流完成后记录 download_completed |
| POST /v1/config-gallery/:configId/apply | active账户 | 必需、平台active | Idempotency-Key 去重 apply_delivery_completed；只证明中央交付，不证明目标业务应用成功 |
| GET /v1/feedback | active账户 | 必需、平台active | 自身 Feedback 列表；跨账户/平台资源不泄露 |
| POST /v1/feedback | active账户 | 必需、平台active | `Idempotency-Key` 创建 draft；归属和邮箱不接受浏览器输入 |
| GET /v1/feedback/:feedbackId | active账户 | 必需、平台active | 读取自身 draft/已提交 Feedback 与附件 metadata |
| PATCH /v1/feedback/:feedbackId | active账户 | 必需、平台active | draft-only，`If-Match`；仅受控正文/category/contact/client context 字段 |
| POST /v1/feedback/:feedbackId/attachments/upload-intent | active账户 | 必需、平台active | `Idempotency-Key`；最多 5 张/12 MiB，只接受 JPEG/PNG/WebP |
| PUT /v1/feedback/:feedbackId/attachments/:attachmentId/content | active账户 | 必需、平台active | private binary upload；真实大小与 magic 由服务端校验 |
| DELETE /v1/feedback/:feedbackId/attachments/:attachmentId | active账户 | 必需、平台active | draft-only；进入受控 attachment cleanup，不直删 Storage metadata |
| POST /v1/feedback/:feedbackId/submit | active账户 | 必需、平台active | 所有附件必须结算 active；服务端 Auth 读取 email 快照并转为 new |
| POST /v1/identity/delete-request | 有效会话、近期重新认证 | 必需、平台active | 全局删除请求；不立刻删除Auth User |

principal为状态诊断接口，返回disabled时不表示授权通过；其余普通接口拒绝disabled。失效/revoked Key始终401，即使仅查询principal。system_admin和全局deleting身份不能构造普通Principal。平台已disabled时的关闭/删除申请通过受控支持/Admin路径处理，不为此开放一般业务API。

旧公开Pricing通过 Browser → BFF → GET /plans；商品目录通过服务端BFF调用 GET /v1/commerce/offers，不需要用户Bearer，但Platform Key只允许留在服务端。商品接口返回 Offer 的服务端价格、期限和购买就绪原因，不返回provider ID、platform config、兑换库存或Secret；Free/paid展示不意味着用户已获得权益。结账接口只生成不可变快照；本阶段没有Provider配置时保持购买关闭，不伪造payment_url。

Admin独立 /admin/api/v1：`GET /security/status` 在全局AAL2 gate前验证活动会话与单一管理员身份，返回当前AAL及当前session近期MFA proof到期时间；其他路由要求AAL2。其余资源包括 platforms、origins、plans、platform-accounts、keys、redemption-batches、subscriptions、Config resources/reviews/Gallery governance/usage、Feedback、audit、deletion-jobs。Feedback 列表在 SQL 游标分页前组合 q/status/category/label/user/email/has_attachments/from/to；详情返回受保护正文、联系快照、图片 metadata 与 timeline，图片内容通过 Admin binary proxy 获取。status/labels/flag/note 使用受控领域命令；服务端 CSV export 不依赖当前浏览器页；批量删除要求 recent-MFA、reason 与 operation id。Config 资源列表与审核同样先在 SQL 端按 platform 过滤；平台总容量通过 file-policy 的 `max_platform_total_bytes` 读取/修改，修改总容量要求近期 MFA。所有入口强制Admin鉴权；高风险规则不可由前端参数关闭。

兑换码批次创建重放以 `200` 返回 `batch_id`、`status=pending_delivery` 与 `creation_state=replayed_existing`，不返回 plaintext codes 或 delivery receipt；同一 `creation_operation_id` 参数不一致返回 `409 IDEMPOTENCY_CONFLICT`。新批次使用 Offer-based 或 Admin-defined Plan + duration；服务端冻结 Plan/Offer/期限快照，不接受 product_code，不建立 Free 或永久权益兑换批次。请求字段以 Admin OpenAPI 为准。

## 2. 请求与返回

JSON统一外壳为 data + request_id，错误为 error:{code,message} + request_id；错误文案可本地化，机器判断只使用code。下载成功返回字节和X-Request-Id，失败在发流前返回标准错误，发流后中断记录独立事件。

UUID用字符串、时间为UTC ISO 8601，字节在V1范围内用JSON整数。列表默认20、最大100，游标按(created_at,id)稳定排序；不使用无界列表。上传体例外限1 MiB，其余JSON请求最大64 KiB；中央 API、BFF 及登录/MFA入口共用有界读取器，在接收过程中限制真实字节、大小声明、编码和接收超时，不先完整读取再检查；对metadata/preferences/features作基础类型和长度校验。

~~~ts
type AccountPrincipal = {
  userId: string;
  platformId: string;
  platformAccountId: string | null;
  platformStatus: 'active' | 'disabled';
  accountStatus: 'active' | 'suspended' | 'closed' | 'not_activated';
};

type Entitlement = {
  effective_status: 'active' | 'none' | 'suspended';
  entitlement_kind: 'free' | 'term' | 'perpetual' | 'none';
  plan: { code: string; name: string } | null;
  features: Record<string, unknown>;
  started_at: string | null;
  current_period_end: string | null;
  evaluated_at: string;
  next_transition_at: string | null;
};
~~~

Free：started_at=NULL、end=NULL、kind=free。none：plan=NULL、features={}、两个期限字段NULL。suspended返回features={}，可保留实际plan/kind供展示；不得因为plan非空而在业务放行。expired不作为有效返回状态：已到期付费回退Free/none，历史在Admin事件中查看。

Profile PATCH仅允许display_name/avatar_url/bio/locale/timezone/metadata，拒绝所有归属字段。Preferences采用JSON Merge Patch，null删除键，不直接参与授权；64KiB限制适用于合并后的结果。GET返回服务端ETag，PATCH必须携带If-Match并在同一更新事务内校验，不一致返回412，缺少前置条件返回428 PRECONDITION_REQUIRED，避免静默覆盖；不混用基于秒级HTTP日期的版本判断。

兑换请求：{code} + Idempotency-Key。统一示例 AISEN-V1-7KM9-2XQ8-F3DP-V7RW-K6CY-MZTA-9H；plan、期限和账户不由请求指定。

Version 上传意图通过 `/v1/configs/:configId/versions/upload-intent` 创建；返回受控的 Version content 路径，不返回 Storage URL。原始字节、内容类型与大小以 Account OpenAPI 为准，预算由 Config slot 和平台总容量强约束。

## 3. 错误、超时与缓存

| HTTP | 稳定code |
|---|---|
| 400/413 | INVALID_INPUT、UPLOAD_SIZE_MISMATCH、PAYLOAD_TOO_LARGE |
| 401 | UNAUTHORIZED、PLATFORM_CREDENTIAL_INVALID、SESSION_REVOKED |
| 403 | PLATFORM_DISABLED、ACCOUNT_SUSPENDED、ACCOUNT_CLOSED、ADMIN_REQUIRED、MFA_REQUIRED、RECENT_MFA_REQUIRED、GLOBAL_DELETE_PENDING |
| 409 | ACCOUNT_NOT_ACTIVATED、ACTIVATION_DISABLED、PURCHASES_PAUSED、PLAN_CONFLICT、ENTITLEMENT_PERPETUAL、ENTITLEMENT_SUSPENDED、IDEMPOTENCY_CONFLICT、OPERATION_IN_PROGRESS、FILE_BUSY、FILE_CONTENT_CONFLICT、REPLACEMENT_CAPACITY_REQUIRED、CONFIG_SLOT_LIMIT_EXCEEDED、PLATFORM_STORAGE_QUOTA_EXCEEDED、VERSION_NOT_READY、SUBMISSION_PENDING、QUOTA_EXCEEDED |
| 404 | RESOURCE_NOT_FOUND、INVALID_CODE |
| 410 | CODE_EXPIRED、UPLOAD_INTENT_EXPIRED |
| 409 | CODE_DISABLED、CODE_ALREADY_REDEEMED |
| 412 | PRECONDITION_FAILED |
| 428 | PRECONDITION_REQUIRED |
| 429 | RATE_LIMITED |
| 503 | AUTHORIZATION_UNAVAILABLE、STORAGE_UNAVAILABLE |

跨租户/跨用户资源统一404，不泄露存在性。CODE_DISABLED/EXPIRED仅针对已确认同平台码返回。所有错误去除SQL细节和Secret。

Account普通请求默认超时5秒；Consumer BFF 当前通过 server-only HTTP fetch 和 AbortSignal deadline 调用中央服务。安全读取是否重试由具体 Consumer 明确实现；写操作不得因为网络失败盲目重放，只有合同明确支持且保持同一 Idempotency-Key 的操作才可恢复。业务拒绝不重试。

上传流不自动重传，断线后先GET状态；用户明确重试时使用同file_id及同内容。Admin生成兑换码不自动重试生成明文，只查询原operation状态。预算结束返回明确可恢复错误，不默认放行。

V1 Principal、权益、Profile、文件、Auth和Admin响应均private,no-store。公开套餐也默认no-store，以兑现features实时更新；以后启用缓存须另定义一致性窗口，不在V1偷偷使用CDN长期缓存。

## 4. Consumer 集成职责

- `contracts/account/v1/openapi.json` 与 `contracts/admin/v1/openapi.json` 是公共 wire contract；兼容规则与 changelog 与合同同目录维护。
- `tests/consumer-harness` 是 test-only 可执行 conformance Consumer。它用独立 Node server + 极薄 UI 验证 Cookie/session/CSRF、server-only Platform Key BFF、canonical allowlist、binary 与 fail-closed 授权，但不是产品 starter。
- `apps/admin` 同样自行拥有 Admin Auth adapter；中央业务规则仍只在 PostgreSQL private 领域函数和中央 API 中实现。
- `packages/domain` 保留为中央内部模块，Consumer 不安装、不 vendor，也不能通过 workspace 引用把内部 DTO/算法重新变成公共 SDK。

Account handler不依赖Consumer浏览器正确判断，服务端再次鉴权。业务保护判断platform/account状态；需付费能力还检查effective_status和features，不能只看Auth成功。Consumer 遇到中央不可用必须 fail closed，不能本地降级成 Free 或授权成功。

## 5. Consumer Harness、Registry 与版本

Registry `contract_compatibility` 记录 Account/Admin `v1` canonical contract、Consumer Harness 与 Admin Consumer Lab 路径，并记录静态/Local E2E 验证命令；不再维护页面模板 inventory 或 starter 分发元数据。

新平台不安装 AisenHub runtime SDK。接入时先固定中央 commit 与 contract major，阅读 changelog/compatibility，再按目标技术栈自行实现并拥有 Auth/BFF/integration，并用 Harness 对照协议/安全行为。品牌、页面布局和平台业务可以定制；金额、期限、授权、配额、支付进度和错误语义不能随 UI 改写。

API保持 `/v1` 向后兼容扩展；破坏字段、鉴权或语义必须进入新 major 或经过明确兼容迁移。`pnpm contracts:breaking` 对基线检查删除 operation、删除 schema 字段、收窄 enum 等破坏性变化；`pnpm test:consumer-harness` 防止 `@kit/*`、Next/React、Admin/Domain 私有实现或 server credential marker 进入 Harness。

Harness static/process、Registry/contract gates 与 `test:e2e:consumer-harness` 的 Local browser/Auth/API/DB/Storage 链路共同构成中央 conformance 证据；Harness 浏览器资源中禁止 Platform Key、Supabase Secret、SQL/Provider 凭据。Harness 不是生产部署承诺，新平台仍必须在自己的仓库和环境完成实际验收。
