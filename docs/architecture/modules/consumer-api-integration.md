# Consumer 接入与 HTTP 合同架构

Aisenhubplatform 不向 Consumer 发布中央 runtime SDK。公开集成边界是：**标准 HTTP + canonical OpenAPI + Platform Integration Package + 独立 Conformance Harness**。

## Requirements

本模块主要承担 [Consumer 接入与 HTTP 合同需求](../../spec/consumer-api-integration.md) `REQ-API-001` ～ `REQ-API-011`，并共同满足 `REQ-SYS-001` ～ `REQ-SYS-004`、`REQ-SYS-007`、`REQ-SYS-009`。

## 1. Canonical Contract

机器可读唯一 wire contract：

```text
contracts/account/v1/openapi.json
contracts/admin/v1/openapi.json
```

当前 `pnpm contracts:check` 验证：Account v1 40 operations，Admin v1 76 operations。

`packages/domain` 是中央内部 package，不是 Consumer runtime contract。Consumer 不安装/复制它来代替 OpenAPI。

## 2. Account API 能力面

当前 Account v1 主要分组：

- account：principal / activate / close / recent auth；
- plans / commerce offers；
- subscription：read / checkout / redeem；
- profile / preferences；
- config / version / content；
- config gallery / like / apply；
- feedback / attachments / submit；
- identity delete request。

具体 method/path/body/status/header 只以 OpenAPI 为准。

## 3. Admin API 能力面

Admin v1 覆盖 security/system-admin、platforms/origins/keys、global identity/deletion jobs、platform account workbench、Plan/Commerce/Entitlement/Redemption、Billing、Config/Gallery/File policy、Feedback、Audit、platform/global overview。

Admin 浏览器不直接调用中央 API，而经 `apps/admin` same-origin BFF。

## 4. HTTP Envelope

JSON 成功：`{ "data": ..., "request_id": "uuid" }`。

错误：`{ "error": { "code": "STABLE_MACHINE_CODE", "message": "..." }, "request_id": "uuid" }`。

机器逻辑只看稳定 code，不解析本地化 message。

Binary success 返回 bytes + request ID；binary 失败在开始流之前仍返回标准 JSON error。流开始后的中断记录独立事件。

## 5. 平台认证

Account API 使用 server-only Platform Key；用户路由另外需要 Bearer session：

```text
Browser -> Consumer own same-origin BFF
BFF -> X-Platform-Key + Authorization -> central Account API
```

Platform Key 永不进入 Browser JS、HTML、URL、localStorage 或公开日志。平台归属由 Key 映射决定，不接受浏览器提交 platform ID 覆盖。

## 6. Consumer Auth Ownership

每个 Consumer 自己拥有 Supabase Auth integration、Cookie/session policy、CSRF/Origin、refresh/logout/recent auth、server-side HTTP integration 和产品 UI。

中央不提供一个 `@aisenhub/auth-core` 形式的变相 runtime SDK。稳定性通过合同、Integration Guide、Harness 和 HTTP E2E 保证，而不是共享运行时代码。

## 7. Reliability Semantics

- GET/HEAD 等安全读取可在总预算内有限恢复；
- mutation 默认不自动 replay；
- 只有合同明确幂等且保持同一 Idempotency-Key/body 时才安全恢复；
- binary upload 不盲目自动重传，失败后先读服务端状态；
- 400/401/403/409/412/428 是业务/协议结果，不当 transport retry；
- 429 尊重 Retry-After 与操作语义；
- 受保护服务中央不可用时 fail closed。

## 8. Cache / ETag / Idempotency

用户/Account/Admin 响应原则上 `private,no-store`。公开目录当前也默认 no-store，以避免 features/catalog 缓存产生授权或购买语义漂移。

Profile/Preferences 等并发资源通过 ETag/If-Match。

创建/兑换/Checkout 等可重放 mutation 使用 Idempotency-Key；客户端不得把“网络失败”直接转换成新 key 重试。

## 9. Payload Budget

普通 JSON 请求有明确边界；中央 API/BFF 在接收过程中做真实 byte limit 和 timeout，不允许先无限读完整 body 再检查。

Config Version 与 Feedback attachment 是受控 binary exception，各自有更严格大小、类型和并发 gate。

## 10. Platform Integration Package

仓库根 `platform-integration/` 是当前接入稳定资料面：

```text
README.md                 developer entry
AGENTS.md                 AI entry
manifest.json             contract/capability index
ai/capabilities.json      capability -> operationId/docs/conformance
guides/*                  auth/account/commerce/config/feedback...
examples/env.example      config names only
conformance/README.md     validation entry
```

它只引用 root canonical OpenAPI，不复制第二份 schema。

当前 `ai/capabilities.json` 共 11 个 capability：

- 核心：`auth-session`、`account-principal`、`account-activation`、`authorization-entitlement`、`errors-observability`；
- 按需：`profile-preferences`、`config`、`config-gallery`、`feedback`、`commerce`、`lifecycle`。

除 Auth/Errors 这类不直接属于 Account OpenAPI operation 的能力外，capability 通过 `operation_ids` 指向 canonical operationId，并同时绑定 guide 和 conformance profile。

## 11. AI 接入顺序

Agent 应按：读取 integration manifest -> 固定 contract major -> 选择 capability -> 配置环境和 server-only Key -> 实现目标平台 Auth/BFF -> principal/activate/authorization -> 可选业务 -> conformance -> 输出证据与未完成项。

## 12. Consumer Conformance Harness

`tests/consumer-harness` 是 test-only 原生 Node HTTP Consumer：

- 不属于 pnpm workspace 产品应用；
- 不使用 Next.js；
- 不依赖 `@kit/*` runtime；
- Platform Key 只在 server 进程；
- Browser 使用 HttpOnly access/refresh、可读 CSRF；
- fixed allowlist；
- no-store/request ID；
- binary proxy；
- fail-closed feature authorization。

Harness 当前固定 JSON body 上限 65,536 bytes、binary 上限 1,048,576 bytes；上游 timeout 默认 5000ms，可由 `ACCOUNT_API_TIMEOUT_MS` 调整但被限制在 1–30,000ms。这里是 test/conformance fixture 的明确预算，不自动成为所有生产 Consumer 的全局 SLA。

它证明公开协议可以由独立 Consumer 实现，但不是生产 starter/template。

## 13. Harness E2E

Local E2E 使用两个独立 origin/platform key + 真实 Local Supabase/Auth/API/DB/Storage fixture，覆盖 platform isolation、login/session/logout、principal/activate、offers/entitlement/redeem、Profile/Preferences ETag、Config/Version/Gallery/Like/Usage、Feedback draft/attachment/submit、Suspend/fail-closed。

Conformance PASS 不等于目标平台已完成产品设计、Production secrets、Provider、容量或发布验收。

## 14. Registry

`registry/manifest.json` 当前是 local-only metadata，记录 Account/Admin contract major、platform-integration path、harness path、static/local E2E command。

不分发 npm SDK、tarball、页面模板，也不是生产服务发现 Registry。

## 15. Contract Compatibility

`/v1` 是 wire major。正式 baseline 后遵循 expand -> migrate -> contract。

允许新增 endpoint、新 optional input、新 response field。

破坏性变化包括删除/改名 operation、删除 schema property、类型/enum 收窄、对既有 request 增加 required input、改变既有安全要求/语义。

`pnpm contracts:breaking` 负责检测可静态识别的破坏。

当前 breaking comparator 已有单测证明会拒绝：新增既有请求 required field、删除参数、删除 response property、删除 enum value、改变 operation security；同时允许 additive endpoint 和 optional response field。它不是完整的形式化 API compatibility verifier，未覆盖的语义变化仍需要 Review/测试。

## 16.1 历史 Consumer Lab 边界

历史 Proposal 曾引入 Admin `/admin/consumer-lab` 作为维护者合同浏览界面，但当前 HEAD 与工作区都不存在该 route/feature；稳定接入和验证入口已经收敛为 `platform-integration/`、canonical OpenAPI 与 `tests/consumer-harness`。因此 Consumer Lab 属于历史实现过程，不是当前 Architecture，也不是 Active Requirement。

## 17. Consumer 不得复制的领域规则

Consumer 不得自己成为第二事实源：entitlement expiry/conflict、Plan/Offer/Price、storage quota、redemption、Billing verification/settlement、identity lifecycle、Admin recent-MFA、cross-tenant ownership。

UI 可以定制，但授权、金额、期限、配额、支付进度和错误语义来自中央服务。

## 18. 验证命令

- `pnpm contracts:check`
- `pnpm contracts:breaking -- <base>`
- `pnpm platform-integration:check`
- `pnpm test:consumer-harness`
- `pnpm test:e2e:consumer-harness`
- `pnpm test:package-integration`

任何“已兼容”结论应说明实际运行了哪一层：static、unit、Local E2E、Hosted/Production。
