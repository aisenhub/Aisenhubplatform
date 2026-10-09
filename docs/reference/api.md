# HTTP、Consumer Conformance 与 API 合同

本文件描述当前 API、Consumer conformance 与 Admin 集成合同。整体边界见 [系统架构](../architecture/overview.md)。Canonical OpenAPI 3.1 合同位于 [Account](../../contracts/account/v1/openapi.json) 和 [Admin](../../contracts/admin/v1/openapi.json)；`packages/domain/src/contracts` 是中央内部类型源，不是 Consumer runtime 依赖。Consumer/Admin BFF 必须遵守同一 wire contract，不能各自复制领域规则。

## 1. 调用和权限矩阵

Central API路径以 /v1 为前缀；Edge部署的 /functions/v1/account-api 外层前缀属于部署地址，不进入业务合同。Platform Key在X-Platform-Key中传递；用户access token在Authorization: Bearer中传递，禁止放入URL。platformId 由服务端 Key 映射确定，Consumer 不提交可覆盖归属的 platform 标识。

| 方法与路径 | 用户条件 | 平台凭据 | 说明 |
|---|---|---|---|
| GET /v1/plans | 不需要用户；不建立账户 | 必需、平台active | 仅公开active套餐字段 |
| GET /v1/subscription/products | 不需要用户；不建立账户 | 必需、平台active | 固定四商品、平台启用状态和明确的purchasable reason；无Provider映射时不可购买 |
| POST /v1/subscription/checkout | active账户 | 必需、平台active、未暂停购买 | 仅提交固定product_code和Idempotency-Key；服务端锁定价格/期限快照；无verified Provider mapping时返回CHECKOUT_UNAVAILABLE；购买暂停时返回PURCHASES_PAUSED |
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
| POST /v1/config-files/upload-intent | active账户 | 必需、平台active | 预约；支持replaces_file_id |
| PUT /v1/config-files/:id/content | active账户 | 必需、平台active | 有界原始字节；内部完成上传 |
| GET /v1/config-files | active账户 | 必需、平台active | 自身列表、预算、状态 |
| GET /v1/config-files/:id | active账户 | 必需、平台active | 查询上传/删除进度 |
| GET /v1/config-files/:id/content | active账户 | 必需、平台active | 授权后端下载代理 |
| DELETE /v1/config-files/:id | active账户 | 必需、平台active | 202异步删除，重复请求幂等 |
| POST /v1/identity/delete-request | 有效会话、近期重新认证 | 必需、平台active | 全局删除请求；不立刻删除Auth User |

principal为状态诊断接口，返回disabled时不表示授权通过；其余普通接口拒绝disabled。失效/revoked Key始终401，即使仅查询principal。system_admin和全局deleting身份不能构造普通Principal。平台已disabled时的关闭/删除申请通过受控支持/Admin路径处理，不为此开放一般业务API。

旧公开Pricing通过 Browser → BFF → GET /plans；商品目录通过服务端BFF调用 GET /v1/subscription/products，不需要用户Bearer，但Platform Key只允许留在服务端。商品接口返回固定商品的价格、期限、启用和购买就绪原因，不返回provider ID、platform config、兑换库存或Secret；Free/paid展示不意味着用户已获得权益。结账接口只生成不可变快照；本阶段没有Provider配置时保持购买关闭，不伪造payment_url。

Admin独立 /admin/api/v1：`GET /security/status` 在全局AAL2 gate前验证活动会话与单一管理员身份，返回当前AAL及当前session近期MFA proof到期时间；其他路由要求AAL2。其余资源包括platforms、origins、plans、platform-accounts、keys、redemption-batches、subscriptions、config-files、audit、deletion-jobs。所有入口强制Admin鉴权；Grant/revoke/pause/resume、批次交付及Key操作的高风险规则不可由前端参数关闭。Admin文件列表的可选 `platform_id` 在受控SQL边界内先于分页过滤；Admin不提供直接更新Projection或任意SQL入口。

兑换码批次创建重放以 `200` 返回 `batch_id`、`status=pending_delivery` 与 `creation_state=replayed_existing`，不返回 plaintext codes 或 delivery receipt；同一 `creation_operation_id` 参数不一致返回 `409 IDEMPOTENCY_CONFLICT`。新批次请求使用 `{product_code: monthly|yearly|lifetime}`，服务端从平台配置快照 Plan/期限；不接受 Free 或客户端自定义 duration。旧批次读取/兑换继续兼容。

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

上传意图：{name,size,content_type,purpose,replaces_file_id?}；返回{file_id,upload_path,expires_at}。path为受控 /v1/config-files/:id/content，非Storage URL。不提供旧版 /complete、/download-url 或浏览器Signed Upload。

## 3. 错误、超时与缓存

| HTTP | 稳定code |
|---|---|
| 400/413 | INVALID_INPUT、UPLOAD_SIZE_MISMATCH、PAYLOAD_TOO_LARGE |
| 401 | UNAUTHORIZED、PLATFORM_CREDENTIAL_INVALID、SESSION_REVOKED |
| 403 | PLATFORM_DISABLED、ACCOUNT_SUSPENDED、ACCOUNT_CLOSED、ADMIN_REQUIRED、MFA_REQUIRED、RECENT_MFA_REQUIRED、GLOBAL_DELETE_PENDING |
| 409 | ACCOUNT_NOT_ACTIVATED、ACTIVATION_DISABLED、PURCHASES_PAUSED、PLAN_CONFLICT、ENTITLEMENT_PERPETUAL、ENTITLEMENT_SUSPENDED、IDEMPOTENCY_CONFLICT、OPERATION_IN_PROGRESS、FILE_BUSY、FILE_CONTENT_CONFLICT、REPLACEMENT_CAPACITY_REQUIRED、QUOTA_EXCEEDED |
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
