# Phase 03：Auth 与 BFF 去 SDK 化

状态：验收通过待推送

## 目标

把 `@kit/account-auth` / `@kit/account-auth-nextjs` 中实际被 Reference Consumer 和 Admin 使用的 Web Auth 行为迁为 app-local implementation，保持 Cookie、CSRF、session recovery、logout fence、recent-auth/MFA 语义等价。

## 前置条件

- Phase 02 完成。
- 三个旧 package 仍未删除。

## 实施步骤

1. 在 `apps/template-preview/app/_lib/auth/` 建立 `core.ts`、`cookie-policy.ts`、`server.ts`、`browser-session.ts`、`browser.ts`；等价迁移应用实际需要的行为。
2. 把旧 Auth package 的 adapter/browser-session 和 safe-returnTo 关键测试迁到 Reference Consumer 本地测试，保留安全负例。
3. 替换 template-preview 所有 Auth SDK import；package.json 直接声明 `@supabase/ssr`、`@supabase/supabase-js`。
4. 在 `apps/admin/app/_lib/auth/` 建立 app-local Auth；Admin 继续允许使用中央内部 `@kit/domain` bounded-body/MFA attestation。
5. 替换 Admin auth routes、BFF、browser session 与 feature pages 的 SDK import；移除 Next transpile auth package。
6. 保持 Admin server-signed MFA attestation、AAL2、recent-MFA 和 fail-closed security/status。
7. 确认 app/runtime 不再 import Auth SDK。

## 失败与恢复

- definitive 401 refresh → expired；上游 outage → authorization unavailable。
- mutation 在 refresh 后默认要求用户重新提交；只有显式 idempotent/replayable mutation 可 replay。
- logout 期间阻止新 mutation；迟到 refresh/login 不能复活退出 session。
- Origin/CSRF、Cookie policy、safe returnTo 不得放宽。

## 验证

```text
pnpm --filter template-preview test:unit
pnpm --filter admin test:unit
pnpm --filter template-preview typecheck
pnpm --filter admin typecheck
pnpm --filter template-preview build
pnpm --filter admin build
git grep "@kit/account-auth-nextjs" -- apps/template-preview apps/admin
git grep "@kit/account-auth" -- apps/template-preview apps/admin
git diff --check
```

## 退出条件

- 两个 app 均不依赖 Auth SDK。
- Reference Consumer 本地测试覆盖原 Auth package 关键安全/并发语义。
- Admin Auth/MFA/BFF tests PASS。
- Phase 04 删除旧 package 不会造成 runtime import 断裂。
