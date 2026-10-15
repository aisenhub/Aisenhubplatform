# Consumer Conformance

`tests/consumer-harness` 是中央仓库 test-only Consumer fixture。它用于证明标准 Auth HTTP + Account `/v1` 可以在不依赖 Admin/private/domain runtime 的情况下实现正确安全边界。

## 稳定命令

```powershell
pnpm platform-integration:check
pnpm test:consumer-harness
pnpm test:e2e:consumer-harness
```

Static Harness 检查包括 canonical operation allowlist、进程边界以及禁止 `@kit/*`、Next/React、Admin/Domain 私有实现和浏览器 Secret marker。

Local E2E 使用真实本地 Supabase/Auth/API/DB/Storage fixture，覆盖独立 origin/platform key、Auth session、activate、Commerce、Profile/Preferences、Config/Gallery、Feedback、Suspend、Logout 与 invalid refresh 等实际边界。

## PASS 的含义

PASS 仅说明中央 fixture 当前满足公开 Consumer contract/conformance。它不证明任何目标平台已经：

- 部署 Platform Key；
- 实现完整 OAuth/注册/找回密码；
- 跑过自己的 E2E；
- 获得 Production 发布授权；
- 联调真实支付 Provider。

目标平台必须保留自己的验证证据。
