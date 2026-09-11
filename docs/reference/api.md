# HTTP、SDK、模板与 API 合同

本文件描述当前 API、SDK 和模板合同。整体边界见 [系统架构](../architecture/overview.md)。OpenAPI 3.1 合同位于 [Account](contracts/account.openapi.json) 和 [Admin](contracts/admin.openapi.json)，共享类型位于 `packages/domain/src/contracts`。SDK 与 BFF 必须遵守同一合同，不能各自复制领域规则。

## 1. 调用和权限矩阵

Central API路径以 /v1 为前缀；Edge部署的 /functions/v1/account-api 外层前缀由apiUrl统一封装，不进入业务合同。Platform Key在X-Platform-Key中传递；用户access token在Authorization: Bearer中传递，禁止放入URL。platformCode只用于SDK启动一致性检查，不能覆盖Key映射的platformId。

| 方法与路径 | 用户条件 | 平台凭据 | 说明 |
|---|---|---|---|
| GET /v1/plans | 不需要用户；不建立账户 | 必需、平台active | 仅公开active套餐字段 |
| GET /v1/subscription/products | 不需要用户；不建立账户 | 必需、平台active | 固定四商品、平台启用状态和明确的purchasable reason；无Provider映射时不可购买 |
| GET /v1/account/principal | 有效用户/会话 | 必需 | 可返回not_activated/suspended/closed/disabled状态供界面提示 |
| POST /v1/account/activate | 有效用户、非Admin、非deleting | 必需、平台active | 仅首次需要allow_activation |
| POST /v1/auth/recent-proof | 当前业务会话 + 独立 email `token_hash` 事件会话 | 不需要Platform Key | 服务端校验同user、事件session及5分钟窗口，仅签发绑定原业务session的proof |
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

旧公开Pricing通过 Browser → BFF → GET /plans；商品目录通过服务端BFF调用 GET /v1/subscription/products，不需要用户Bearer，但Platform Key只允许留在服务端。商品接口返回固定商品的价格、期限、启用和购买就绪原因，不返回provider ID、platform config、兑换库存或Secret；Free/paid展示不意味着用户已获得权益。

Admin独立 /admin/api/v1：platforms、origins、plans、platform-accounts、keys、redemption-batches、subscriptions、config-files、audit、deletion-jobs。所有入口强制Admin鉴权；Grant/revoke/pause/resume、批次交付及Key操作的高风险规则不可由前端参数关闭。Admin文件列表的可选 `platform_id` 在受控SQL边界内先于分页过滤；Admin不提供直接更新Projection或任意SQL入口。

兑换码批次创建重放以 `200` 返回 `batch_id`、`status=pending_delivery` 与 `creation_state=replayed_existing`，不返回 plaintext codes 或 delivery receipt；同一 `creation_operation_id` 参数不一致返回 `409 IDEMPOTENCY_CONFLICT`。

## 2. 请求与返回

JSON统一外壳为 data + request_id，错误为 error:{code,message} + request_id；错误文案可本地化，机器判断只使用code。下载成功返回字节和X-Request-Id，失败在发流前返回标准错误，发流后中断记录独立事件。

UUID用字符串、时间为UTC ISO 8601，字节在V1范围内用JSON整数。列表默认20、最大100，游标按(created_at,id)稳定排序；不使用无界列表。上传体例外限1 MiB，其余JSON请求最大64 KiB；对metadata/preferences/features作基础类型和长度校验。

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
| 409 | ACCOUNT_NOT_ACTIVATED、ACTIVATION_DISABLED、PLAN_CONFLICT、ENTITLEMENT_PERPETUAL、ENTITLEMENT_SUSPENDED、IDEMPOTENCY_CONFLICT、OPERATION_IN_PROGRESS、FILE_BUSY、FILE_CONTENT_CONFLICT、REPLACEMENT_CAPACITY_REQUIRED、QUOTA_EXCEEDED |
| 404 | RESOURCE_NOT_FOUND、INVALID_CODE |
| 410 | CODE_EXPIRED、UPLOAD_INTENT_EXPIRED |
| 409 | CODE_DISABLED、CODE_ALREADY_REDEEMED |
| 412 | PRECONDITION_FAILED |
| 428 | PRECONDITION_REQUIRED |
| 429 | RATE_LIMITED |
| 503 | AUTHORIZATION_UNAVAILABLE、STORAGE_UNAVAILABLE |

跨租户/跨用户资源统一404，不泄露存在性。CODE_DISABLED/EXPIRED仅针对已确认同平台码返回。所有错误去除SQL细节和Secret。

Account普通请求超时5秒；BFF业务授权总预算3秒，预算内只允许一次安全读取重试。SDK仅对网络错误/502/503/504重试幂等读取或携带同一幂等key的受支持操作，最多2次、指数退避加抖动，遵守总预算和Retry-After；业务拒绝不重试。

上传流不自动重传，断线后先GET状态；用户明确重试时使用同file_id及同内容。Admin生成兑换码不自动重试生成明文，只查询原operation状态。预算结束返回明确可恢复错误，不默认放行。

V1 Principal、权益、Profile、文件、Auth和Admin响应均private,no-store。公开套餐也默认no-store，以兑现features实时更新；以后启用缓存须另定义一致性窗口，不在V1偷偷使用CDN长期缓存。

## 4. SDK职责

- account-auth：login/signup/logout/OAuth/linking/password-reset意图；不含Server Key，不直接访问业务表。
- account-auth-nextjs：Browser/Server client、Cookie、刷新、PKCE/Callback、验证helper、同源BFF模板；仅处理框架变化。
- account-server：server-only，封装所有Account endpoint、超时、request_id、错误、幂等。初始化platformKey/apiUrl，平台编号只校验不授权。

~~~ts
const account = createAccountClient({ platformKey, apiUrl, platformCode });
await account.plans.list(); // 公开套餐，不传userToken
const p = await account.principal.get(userToken);
if (p.platformStatus !== 'active' || p.accountStatus !== 'active') deny();
await account.activate(userToken);
const products = await account.listSubscriptionProducts(); // server-only Platform Key boundary
await account.subscription.redeem(userToken, { code, idempotencyKey });
await account.configFiles.createUploadIntent(userToken, input, { idempotencyKey });
// uploadContent只接受V1有界字节/可控流，不返回或传递Storage Secret
await account.configFiles.uploadContent(userToken, fileId, bytes);
~~~

Account handler不依赖Consumer浏览器正确判断，服务端再次鉴权。业务保护判断platformStatus与accountStatus；需付费能力还检查effective_status和features，不能只看Auth成功。

## 5. 模板、安装和版本

统一安装三个包 account-auth、account-auth-nextjs、account-server。正式包命名空间与Registry域名在发布前固定到项目拥有的地址，文档中的包名是职责名，不伪造当前已发布npm包。

Registry含auth-login/auth-signup/auth-forgot-password/auth-reset-password、OAuth callback、pricing-page、profile-settings、preferences-settings、subscription-status、subscription-redeem、config-files-manager、user-menu。模板复制UI、路由配置和BFF调用胶水；授权/金额/日期/配额算法不复制。

模板的工程与组件组织可以参考 MakerKit，但不要求复刻 MakerKit 的视觉模板。产品 UI 以操作顺畅、信息清楚、状态反馈及时和页面有质感为验收标准，品牌、布局和视觉语言可独立定制。

品牌配置含name/logo/routes，UI可以改；Pricing不含支付Checkout。文件UI显示真实占用（包括删除中/未知写入）、剩余预算、Replace所需临时空间及任务状态，不能把“已标记删除”显示成“容量已释放”。

SDK使用SemVer，API保持/v1；破坏性字段或语义修改进入/v2或受审兼容发布。Registry产物记录SDK兼容区间、精确构建版本、依赖和内容校验和，发布固定版本URL。安装命令固定shadcn CLI版本，不用不可重现的latest。

CI在临时全新Next.js消费项目安装实际打包SDK和Registry，执行typecheck/build/Playwright；浏览器bundle扫描禁止Platform Key、Supabase Secret和SQL凭据。模板preview不部署到生产。
