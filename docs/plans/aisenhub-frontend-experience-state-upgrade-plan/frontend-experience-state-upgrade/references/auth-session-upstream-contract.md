# Authentication & Session 上游契约摘要

> 用途：Frontend Experience & State 只能消费这些认证/会话语义，不能在页面里重新设计第二套实现。  
> 来源：上一轮 `Authentication & Session` 优化计划研究结果。  
> 状态：FE-R1已核对Auth Phase01～05实现与Local验证记录；当前暂缓继续开发，现有认证/会话语义冻结消费，不新增第二套实现；hosted/Staging/生产边界仍以实际Auth verification record为准。类型以packages/account-auth导出为准。

## Session 状态

```ts
type SessionSnapshot = {
  state:
    | 'unauthenticated'
    | 'authenticating'
    | 'authenticated'
    | 'refreshing'
    | 'mfa_required'
    | 'expired';
  resolved: boolean;
  stepUp: 'admin_mfa' | 'admin_recent_mfa' | 'consumer_recent_auth' | null;
};
```

- 初始 `resolved:false` 不是确定未登录，不能触发错误 redirect。
- 401 可进入同一 browser document 内 single-flight refresh。
- refresh 401 才是确定 expired；refresh 503/network 是 transient，不得清掉仍可能有效的 refresh cookie。
- `MFA_REQUIRED` / `RECENT_MFA_REQUIRED` 不走 401 refresh loop。
- Admin `authenticated` 只是 browser orchestration 状态，不替代服务端 Admin/AAL2/recent-MFA 授权。

## ReplayPolicy

```ts
type ReplayPolicy =
  | 'never'
  | 'safe-read'
  | 'idempotent-mutation';
```

- GET/HEAD 默认 `safe-read`，refresh 成功后最多 replay 一次。
- mutation 默认 `never`；refresh 可成功，但原 mutation 不自动重发，UI 应提示用户重新提交。
- `idempotent-mutation` 只有 caller 明确声明、原 `Idempotency-Key` 已存在且保持不变、body 可安全重复、且非 binary/stream/auth/MFA/OTP 时才允许最多 replay 一次。
- `If-Match` 本身不构成自动 replay 许可。
- 上传字节流永不自动 replay。

## Logout

- Origin/CSRF 校验通过后尝试 remote revoke。
- 无论 remote revocation 是 `confirmed`、`not_required` 还是 `unavailable`，本地 app auth material 都必须清理。
- UI 不得把 `remote_revocation:'unavailable'` 写成“远端会话已撤销”。
- 不为 remote revoke 重试持久化 credential。

## Admin MFA

- factors `200 + []` 是真实空态；401、429、503 不能折成 empty。
- 首次 TOTP enrollment verify 本身已经是一次真实 MFA 验证并提升 AAL2；目标 Auth 实现会复用同一次事件签 recent proof，不应再要求第二个 OTP 只为获得 proof。
- recent proof 是 HttpOnly、绑定 user/session/factor、5 分钟；session refresh 不延长 TTL。
- enrollment factor verify 已成功但 recent-proof issuance 失败时，UI 应表达“factor 可能已绑定，proof 获取失败”，重新加载 verified factors 并走 existing factor verify 恢复，而不是自动 enroll 第二个 factor。

## Multi-tab

- 仅广播非敏感终态提示，例如 `logged_out` / `session_expired`，Admin/Consumer scope 分离。
- 不广播 token、CSRF、proof、factor/user 数据、授权结果、idempotency key。
- 不因缺少 BroadcastChannel 增加 localStorage credential/event fallback。

## Frontend 依赖规则

1. 若 Auth 优化计划已实施并交付，Frontend 必须复用 shared browser session manager、CSRF/request orchestration 和错误状态，不再复制 fetch/refresh helper。
2. 已核对Auth实现存在；若未来执行分支缺少这些提交，应先解决分支/依赖缺失，不创建替代SessionManager。
3. Frontend 的 `step_up_required` 是 Auth/API 返回的 UI 状态，不是浏览器自行计算 proof 是否过期。
4. 高风险 mutation 是否允许在 MFA 成功后自动继续，严格服从 ReplayPolicy，不由 Dialog 自行决定。

## FE-R1 实际接入

复用两个App的app/_lib/auth-session.ts与account-auth-nextjs/browser导出。stepUp独立于state维护；保留getEpoch/isCurrentEpoch、scoped Cookie、HttpOnly fence/ack、scope隔离终态广播。UI必须处理runtime异常且在异步结果提交前检查epoch；资源切换还需自己的request generation。完整规则见 [执行合同](fe-r1-execution-contracts.md) §2～4；中文提示见 [中文UI合同](chinese-ui-contract.md)。
