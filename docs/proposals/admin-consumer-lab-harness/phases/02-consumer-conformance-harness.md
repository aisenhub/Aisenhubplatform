# Phase 02：Consumer Conformance Harness

状态：验收通过待推送

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

建立 `tests/consumer-harness` 极薄 test-only Consumer，先在 `apps/template-preview` 仍存在时证明它能独立完成公共 HTTP/Auth/BFF 核心闭环。

## 进入条件

- Phase 01 已交付。
- canonical Account OpenAPI 与 checker 通过。

## 文件与职责

- `tests/consumer-harness/contract.mjs`：读取 canonical OpenAPI、operation/security/allowlist 辅助。
- `tests/consumer-harness/server.mjs`：原生 Node 同源 server；Auth cookie、CSRF、BFF allowlist、body limits、Platform Key 注入。
- `tests/consumer-harness/public/index.html`：极薄诊断页面。
- `tests/consumer-harness/public/app.js`：只做登录/logout/principal/subscription 和 raw JSON 呈现。
- `tests/consumer-harness/README.md`：明确 test-only，不是生产模板。
- `tests/spikes/consumer/consumer-harness-contract.mjs`：静态依赖/secret/contract boundary probe。
- root `package.json`：新增 `test:consumer-harness`；此阶段不删除旧 script。

## Harness 行为

1. 启动必须显式提供 loopback `HARNESS_ORIGIN`、`HARNESS_PORT`、Local Supabase/API 配置和 `ACCOUNT_PLATFORM_KEY`。
2. 非 loopback 或 Origin/port 不一致时 fail closed，避免 Harness 被误用成远程服务。
3. GET `/` 返回 HTML，同时建立非 HttpOnly CSRF cookie；HTML/JS 不包含任何 server secret marker/value。
4. POST `/api/auth/login`：有界 JSON、精确 Origin；调用 Supabase password grant；access/refresh 只写 HttpOnly SameSite cookie。
5. POST `/api/auth/refresh`、`/logout`：Origin + CSRF；确定性失效清理 cookie；logout remote failure 也不恢复本地认证。
6. `/api/v1/*` 只允许从 canonical contract 选定的 Account Consumer operation；服务端注入 Platform Key/bearer，mutation Origin+CSRF；不接受浏览器 upstream URL/platform/user header。
7. 二进制 PUT 不 text decode；JSON/body 和 upload 都有界；响应保留 status/content-type/no-store/request_id/etag/content-disposition。
8. `/api/protected/advanced-config` 读取中央 subscription 并严格 `active + feature === true`，异常 fail closed。

## 静态边界

`test:consumer-harness` 必须递归扫描整个 Harness，并断言：

- 没有 `@kit/` import、Next/React、`apps/admin`、`packages/domain`、SQL/Storage/service-role import。
- canonical contract path 存在且 Harness allowlist operation 均存在于 OpenAPI。
- `server.mjs` 不把 `ACCOUNT_PLATFORM_KEY`/token 插入 HTML/public JS。
- Harness 未被 pnpm workspace 收录。

## 定向验证

```text
pnpm test:consumer-harness
node --check tests/consumer-harness/server.mjs
node --check tests/consumer-harness/contract.mjs
pnpm format:check
pnpm lint
git diff --check
```

真实 Local 行为验证在 Phase 04 E2E 迁移时完成；本阶段 smoke 不能冒充完整 Conformance PASS。

## 退出条件

- Harness 独立边界 probe PASS。
- Harness 不是 workspace/部署产物。
- 旧 template-preview 仍可作为回退，Phase 04 尚未删除。
