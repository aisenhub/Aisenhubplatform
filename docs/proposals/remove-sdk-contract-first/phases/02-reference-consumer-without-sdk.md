# Phase 02：Reference Consumer 退出 Account SDK 与 Domain Consumer 依赖

状态：已交付

## 目标

让 `apps/template-preview` 的 Account API 集成由应用本地拥有，不再依赖 `@kit/account-server` 或 `@kit/domain`，同时保持现有 BFF、授权、上传和订阅行为。

## 前置条件

- Phase 01 contract baseline 通过。
- SDK packages 仍存在，作为回滚参考。

## 已核实调用链

- 通用 `/api/v1/[...path]` 已直接 `fetch` Account API，只借用 `@kit/domain/upload`/validation 与 Auth SDK。
- `reauth/verify` 使用 `@kit/account-server` 签发 recent proof。
- `protected/advanced-config` 使用 `authorizeProtectedFeature`。
- subscription page 使用 `@kit/domain/contracts` DTO/guard。

## 实施步骤

1. 在 `apps/template-preview/app/_lib/integration/` 建立 `bounded-body.ts`、`validation.ts`、`account-contract.ts`，只承载 transport/input/public DTO guard，不复制领域算法。
2. 替换 template-preview 中全部 `@kit/domain` import；subscription guard 字段以 canonical OpenAPI 为准。
3. 扩展 `app/api/_lib/account-api.ts` 或增加局部 helper，使 recent-proof 和 protected feature 通过标准 fetch 调中央 API。
4. 重写 `reauth/verify`：当前 access token 与独立 reauth token 只作为服务端 header 发送，不经过 generic browser proxy；错误只暴露稳定 code/request_id。
5. 重写 `advanced-config`：读取 `/v1/subscription`，只在 active + feature strictly true 时放行；上游异常 fail closed。
6. 为 local bounded-body/contract/protected/recent-auth 行为增加或迁移测试，保留 oversized/binary/admission/credential 负例。
7. 删除 template-preview 对 `@kit/account-server`、`@kit/domain` 的依赖；Auth SDK 暂留到 Phase 03。

## 禁止事项

- 不本地计算 entitlement 到期、价格、期限或配额。
- 不让 Browser 接收 Platform Key、reauth access token 或中央 access token。
- 不将二进制上传改为 text，也不取消 1 MiB 与 admission gate。

## 验证

```text
pnpm --filter template-preview test:unit
pnpm --filter template-preview typecheck
pnpm --filter template-preview build
git grep "@kit/account-server" -- apps/template-preview
git grep "@kit/domain" -- apps/template-preview
git diff --check
```

两个 grep 预期无结果；exit 1 记录为“未找到”而不是失败。

## 退出条件

- Reference Consumer Account integration 不依赖 account-server/domain。
- subscription、recent auth、protected feature、BFF/file 现有行为通过。
- Auth SDK 未新增用法。
