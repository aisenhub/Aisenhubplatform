# Aisenhub Platform 总体优化架构

> 适用仓库：`aisenhub/Aisenhubplatform`  
> 目标：将当前分散在 Admin、Consumer、认证、文件、权益、订阅、日志、测试和开发体验中的问题，收敛为可独立分析、独立实施、逐步演进的优化体系。  
> 核心原则：**不通过放宽权限、缓存授权结果、跳过校验、削弱 MFA / CSRF / Origin / RLS / 幂等 / 并发控制等安全约束来换取性能或体验。**

> FE-R1 当前交接（2026-09-10）：Frontend Experience & State 本轮代码与 Local 验收已收口，当前暂缓继续开发，优先承接其他明确功能；具体完成项、未完成项和恢复条件见 [FE-R1 verification record](../verification-record.md) 的 VR-0018/VR-0019。

---

## 1. 文档目标

本文件不是某一个页面或某一个 Bug 的修复清单，而是整个 Aisenhub Platform 后续优化工作的“总目录”和“架构地图”。

后续建议按照本文件中的分类分别建立专题分析，例如：

- `01-auth-session-optimization.md`
- `02-frontend-experience-optimization.md`
- `03-business-workflow-optimization.md`
- `04-api-contract-optimization.md`
- `05-observability-optimization.md`
- `06-testing-quality-optimization.md`
- `07-developer-experience-optimization.md`
- `08-performance-scalability-optimization.md`

每个专题可以继续拆成：

1. 当前实现
2. 已知问题
3. 风险分析
4. 目标架构
5. 改造方案
6. 迁移步骤
7. 测试方案
8. 验收标准

---

# 2. 总体优化架构

建议将整个项目的优化工作划分为 **8 个一级类别**：

```text
Aisenhub Platform Optimization Architecture

├── 01. Authentication & Session
│   ├── Login
│   ├── Refresh
│   ├── Logout
│   ├── Session expiration
│   ├── MFA
│   └── Multi-tab session coordination
│
├── 02. Frontend Experience & State
│   ├── Loading
│   ├── Empty
│   ├── Error
│   ├── Retry
│   ├── Mutation state
│   ├── Mobile layout
│   └── Accessibility
│
├── 03. Business Workflow
│   ├── Files
│   ├── Entitlements
│   ├── Subscription
│   ├── Admin operations
│   └── Idempotent mutation UX
│
├── 04. API Contract & Shared Types
│   ├── API client
│   ├── Error contract
│   ├── Error code taxonomy
│   ├── Request / Response types
│   ├── Domain → API mapping
│   └── Shared frontend/backend contracts
│
├── 05. Observability & Auditability
│   ├── Request ID
│   ├── Structured logs
│   ├── Metrics
│   ├── Tracing
│   ├── Security audit logs
│   └── User-visible support ID
│
├── 06. Testing & Quality Engineering
│   ├── Unit tests
│   ├── Contract tests
│   ├── API tests
│   ├── DB tests
│   ├── E2E
│   ├── Mobile tests
│   └── Failure-path tests
│
├── 07. Developer Experience & Documentation
│   ├── Local startup
│   ├── Environment variables
│   ├── Seed / test accounts
│   ├── Scripts
│   ├── README
│   ├── Troubleshooting
│   └── CI consistency
│
└── 08. Performance & Scalability
    ├── Frontend rendering
    ├── Network calls
    ├── BFF
    ├── Account API
    ├── Database
    ├── Storage
    ├── Pagination
    └── Concurrency / backpressure
```

---

# 3. 类别 01：Authentication & Session

## 3.1 优化目标

建立一个统一、可预测、可恢复的认证与会话体系，使 Admin 和 Consumer 不再各页面自行处理认证异常。

重点不是改变当前安全边界，而是把已经存在的安全机制组织成完整的客户端/服务端状态机。

## 3.2 优化范围

### 登录

关注：

- 正常登录
- 密码错误
- 用户不存在
- 账户未激活
- 服务不可用
- 登录后 returnTo
- 登录后的 MFA 判断

### Session Refresh

需要重点设计：

```text
Request
  ↓
401
  ↓
single-flight refresh
  ↓
┌──────────────┬──────────────┐
│ refresh 成功 │ refresh 失败 │
└──────────────┴──────────────┘
       ↓               ↓
 retry once        login / expired
```

核心原则：

- 同时多个 401 只触发一次 refresh
- refresh 不缓存授权结果
- refresh 失败必须进入确定状态
- mutation 请求不能无条件自动重放
- 上传字节流不能偷偷重传

### Logout

重点检查：

- 本地 Cookie 清理
- 远端 session revoke
- revoke 失败时的本地退出策略
- 多 Tab 同步退出
- logout 后页面缓存和客户端状态清理

### MFA

单独作为认证体系中的高优先级子项目：

- MFA enrollment
- MFA challenge
- MFA verify
- OTP 错误
- OTP 超时
- rate limit
- enrollment 中断
- session 过期
- recent-auth proof
- MFA required 页面恢复逻辑

## 3.3 目标架构

建议最终形成：

```text
AuthSessionManager
│
├── getSessionState()
├── login()
├── refresh()
├── logout()
├── requireRecentMfa()
├── handle401()
└── broadcastSessionChange()

SessionState
├── unauthenticated
├── authenticating
├── authenticated
├── refreshing
├── mfa_required
└── expired
```

## 3.4 后续专题重点

后续可以单独建立：

`01-auth-session-optimization.md`

重点回答：

- 当前完整认证调用链是什么？
- access token 和 refresh token 生命周期是什么？
- 哪些请求允许 401 后 replay？
- MFA proof 在哪里生成、保存、验证和失效？
- Admin 与 Consumer 是否共用同一套 session orchestration？
- logout 在远端服务不可用时应该如何表现？

## 3.5 优先级

**P0**

原因：认证问题会影响所有业务页面。

---

# 4. 类别 02：Frontend Experience & State

## 4.1 优化目标

把当前“工程功能页面”升级为具有统一产品体验的 Admin / Consumer UI。

最大原则：

> 页面不应该通过一条 `status` 字符串承担所有状态。

## 4.2 建议统一五态模型

所有远程数据页面至少区分：

```text
Loading
Success
Empty
Recoverable Error
Authorization / Permission Error
```

Mutation 再增加：

```text
Idle
Pending
Success
Failure
```

## 4.3 Loading

需要统一：

- Route loading
- Section loading
- Button pending
- Row-level pending
- Skeleton
- Initial load
- Background refresh

避免：

- 页面首次进入无反馈
- 一个全局 `busy` 阻塞整个页面
- 删除一个文件导致全部操作按钮 disabled

## 4.4 Empty State

Empty 必须区别于 Error。

例如：

```text
Files = []
```

应该显示：

> 暂无配置文件  
> 上传第一个文件

而不是只显示：

> 暂无数据

Admin 场景也应区分：

- 真空数据
- filter 无匹配
- platform 尚未选择
- 权限不足
- 数据加载失败

## 4.5 Error UX

建立统一错误展示层：

```text
ApiError
   ↓
ErrorPresenter
   ↓
User message
Retry action
Support request ID
```

避免直接展示底层错误码：

```text
AUTHORIZATION_UNAVAILABLE
PRECONDITION_FAILED
```

错误码可以作为 Debug / Support 信息，但不能成为普通用户的主文案。

## 4.6 Mobile

Admin 和 Consumer 应至少统一审查：

- 320px / 375px / 390px / 768px
- Grid 降级
- 表格变 Card
- 长 ID 换行
- 长文件名截断
- Button wrapping
- Modal viewport
- OTP 输入
- 文件操作区

## 4.7 Accessibility

重点：

- `role="alert"`
- `role="status"`
- focus management
- keyboard navigation
- form labels
- field error association
- modal focus trap
- aria-live
- disabled / pending 的可感知状态

## 4.8 目标共享组件

建议形成：

```text
packages/ui
├── AsyncState
├── PageLoading
├── SectionLoading
├── ErrorState
├── EmptyState
├── RetryButton
├── MutationButton
├── ConfirmDialog
├── StatusBadge
└── SupportErrorId
```

## 4.9 后续专题

`02-frontend-experience-optimization.md`

可进一步按：

- Admin
- Consumer
- Mobile
- Accessibility
- Shared UI states

拆分。

## 4.10 优先级

**P1**

---

# 5. 类别 03：Business Workflow

这一类专门处理业务页面本身，不与底层认证、API Contract 混在一起。

---

## 5.1 Files

建议独立分析：

### 文件生命周期

```text
reserved
   ↓
uploading
   ↓
processing
   ↓
active
```

异常：

```text
failed
unknown_write_outcome
cancel_requested
deleting
deleted
```

需要明确每个状态：

- 用户看到什么
- 可以做什么
- 不能做什么
- 是否允许 retry
- retry 是否安全
- 是否需要相同 idempotency key
- 是否需要重新获取 upload intent

### 文件操作粒度

从：

```text
global busy
```

升级为：

```text
uploadPending
refreshPending
deletingFileIds
downloadingFileIds
```

### Pagination

既然 API 已经支持 cursor，页面应逐步支持：

```text
initial 20
    ↓
Load More
    ↓
cursor
```

后续数据量更大再考虑 virtual list。

---

## 5.2 Subscription

重点：

- redeem pending
- double-click protection
- stable idempotency key
- retry semantics
- code invalid
- code expired
- code already used
- entitlement refresh
- current plan display
- expiration presentation

幂等键必须绑定“一个逻辑操作”，而不是绑定“每一次点击”。

---

## 5.3 Entitlements / Admin Operations

重点：

- Platform selector
- Plans
- Redemption batches
- one-time secret
- delivery confirmation
- destructive action confirmation
- recent MFA
- row-level mutation
- filtering
- pagination
- audit visibility

Admin 的高风险操作应该逐渐形成统一模型：

```text
User action
 ↓
Confirm
 ↓
Recent MFA if required
 ↓
Mutation
 ↓
Server result
 ↓
Audit / Request ID
```

---

## 5.4 后续专题

可以进一步拆成：

- `03a-files-optimization.md`
- `03b-subscription-optimization.md`
- `03c-entitlements-admin-optimization.md`

## 5.5 优先级

**P1**

---

# 6. 类别 04：API Contract & Shared Types

## 6.1 优化目标

这是整个项目最重要的基础治理之一。

目标是：

> 页面、BFF、Account API、Domain 不再各自定义错误和 Response 结构。

## 6.2 当前需要重点治理的问题

主要包括：

- 多种错误 envelope
- 错误 code 命名不统一
- Domain Error 和 API Error 无显式 mapping
- 页面自己 parse JSON
- CSRF header 多处重复
- Origin header 多处重复
- request ID 获取不统一
- idempotency lifecycle 无统一 client abstraction

## 6.3 推荐统一 Response

成功：

```ts
type ApiSuccess<T> = {
  data: T;
  request_id: string;
};
```

失败：

```ts
type ApiFailure = {
  error: {
    code: ApiErrorCode;
    message?: string;
    details?: unknown;
  };
  request_id: string;
};
```

## 6.4 Error Code 分层

建议明确四层：

```text
Database / Supabase Error
          ↓
DomainError
          ↓
ApiErrorCode
          ↓
UserMessageKey
```

例如：

```text
DB constraint violation
      ↓
DomainError.CONFLICT
      ↓
PLAN_ALREADY_EXISTS
      ↓
admin.planAlreadyExists
```

避免一个字符串同时承担四种职责。

## 6.5 API Client

建议建设：

```text
packages/api-client
├── client.ts
├── auth-fetch.ts
├── csrf.ts
├── errors.ts
├── response.ts
├── idempotency.ts
└── request-id.ts
```

它负责：

- CSRF
- Origin
- JSON encode/decode
- Error normalize
- request ID
- 401 orchestration
- timeout
- retry policy
- idempotency semantics

但它**不负责**：

- 绕过授权
- 缓存 authorization result
- 自动重放所有 mutation

## 6.6 Contract Check

最终建议：

```text
OpenAPI
   ↓
generated / validated types
   ↓
BFF
   ↓
Frontend
```

CI 必须可以发现 Contract Drift。

## 6.7 后续专题

`04-api-contract-optimization.md`

## 6.8 优先级

**P0 / P1**

建议紧跟 Authentication 改造。

---

# 7. 类别 05：Observability & Auditability

## 7.1 优化目标

做到：

> 用户看到的一次错误，可以从 Browser 一直追踪到 BFF、Account API、Database / Storage。

## 7.2 Request ID

推荐链路：

```text
Browser
  ↓
BFF request_id
  ↓
Account API
  ↓
DB / Storage
```

全链路保留同一 request ID 或 trace context。

## 7.3 Structured Logging

建议标准字段：

```json
{
  "request_id": "...",
  "operation": "config_file.upload",
  "route": "...",
  "http_status": 409,
  "error_code": "UPLOAD_SIZE_MISMATCH",
  "duration_ms": 130,
  "platform_id": "...",
  "account_id": "...",
  "resource_id": "...",
  "bytes": 12345
}
```

## 7.4 Security Redaction

禁止写入日志：

- access token
- refresh token
- session cookie
- CSRF token
- MFA secret
- OTP
- redemption plaintext code
- 文件内容
- 敏感 credential

## 7.5 Metrics

建议最先做：

### Auth

- login success/failure
- refresh success/failure
- MFA challenge success/failure
- logout revoke failure
- 401 rate
- 403 rate
- 429 rate

### Files

- upload intent latency
- upload latency
- upload failure
- unknown write outcome
- delete latency
- storage error

### Subscription

- redeem success/failure
- invalid code
- already used
- conflict
- entitlement refresh latency

## 7.6 UI 支持编号

UI 错误应提供：

```text
操作失败，请重试。
错误编号：01J...
```

用户无需理解底层错误码。

## 7.7 Audit Log

与普通应用日志分离：

```text
Application logs
Security logs
Business audit logs
```

例如 Admin 操作：

- 谁
- 在哪个 Platform
- 什么时候
- 做了什么
- 操作对象
- 操作结果
- request ID

## 7.8 后续专题

`05-observability-optimization.md`

## 7.9 优先级

**P1**

---

# 8. 类别 06：Testing & Quality Engineering

## 8.1 优化目标

当前项目已经有较多 DB / API / 安全测试基础。

下一步重点不是单纯“增加测试数量”，而是建立统一质量矩阵。

## 8.2 Testing Pyramid

```text
              E2E
           /       \
      Integration / API
        /           \
 Contract          DB
        \           /
             Unit
```

## 8.3 必须重点补失败路径

Auth：

- expired access token
- refresh success
- refresh failure
- concurrent 401
- refresh single-flight
- logout revoke unavailable
- CSRF failure
- origin failure

MFA：

- no factor
- API unavailable
- incorrect OTP
- expired challenge
- rate limit
- enrollment interrupted
- recent-auth expiry

Files：

- empty
- API 500
- upload intent reject
- binary upload failure
- delete failure
- unknown write outcome
- pagination
- concurrent actions

Subscription：

- invalid code
- duplicate code
- retry with same idempotency key
- entitlement refresh failure

Admin：

- MFA required
- permission denied
- destructive confirm
- one-time secret behavior

## 8.4 E2E

建议正式使用 Playwright 结构：

```text
tests/e2e
├── auth.spec.ts
├── session-refresh.spec.ts
├── mfa.spec.ts
├── files.spec.ts
├── subscription.spec.ts
└── admin-entitlements.spec.ts
```

Projects：

```text
desktop-chromium
mobile-chromium
```

后续再扩 Safari / Firefox。

## 8.5 Contract Tests

重点验证：

```text
OpenAPI schema
↕
Actual BFF Response
↕
Frontend parsing
```

Error Envelope 也必须做 Contract Test。

## 8.6 CI Gate

建议最终形成：

```text
format
lint
typecheck
unit
contracts
db
api
e2e-critical
build
```

PR 根据改动目录选择性运行，但主分支需要完整验证。

## 8.7 后续专题

`06-testing-quality-optimization.md`

## 8.8 优先级

**P1**

---

# 9. 类别 07：Developer Experience & Documentation

## 9.1 优化目标

做到：

> 新开发者从 clean clone 到可以登录 Admin / Consumer、操作文件和订阅，只需要明确的有限步骤。

## 9.2 Local Startup

目标命令体验：

```bash
pnpm install
pnpm setup:local
pnpm dev
```

或最少明确：

```bash
pnpm db:start
pnpm db:reset
pnpm dev
```

并输出：

```text
Consumer     http://localhost:...
Admin        http://localhost:...
Supabase     ...
Account API  ...
```

## 9.3 Environment Variables

`.env.example` 应分类：

```env
# Public
NEXT_PUBLIC_...

# Server runtime
...

# Supabase
...

# Account API
...

# Platform
...

# Local-only
...
```

每项注明：

- required / optional
- public / secret
- local generated / manual
- example value

## 9.4 Startup Validation

启动前自动检查：

- Node version
- pnpm version
- Docker
- Supabase CLI
- Deno if required
- env
- ports
- database
- migrations

## 9.5 Remove Machine-Specific Paths

任何类似：

```text
D:\APP\...
/Users/xxx/...
```

都不能进入标准 npm scripts。

使用：

- PATH
- `DENO_BIN`
- package runner
- repo-local tool

## 9.6 Seed / Accounts

文档应明确：

- local Admin account
- local Consumer account
- platform seed
- plan seed
- MFA test procedure
- test redemption code 创建方式

避免开发者自己直接改数据库造状态。

## 9.7 README 分工

README 只维护稳定入口：

```text
Overview
Architecture
Getting Started
Commands
Testing
Environment
Troubleshooting
```

动态进度：

```text
docs/planning
docs/evidence
docs/status
```

不要在 README 重复维护。

## 9.8 后续专题

`07-developer-experience-optimization.md`

## 9.9 优先级

**P1**

---

# 10. 类别 08：Performance & Scalability

## 10.1 优化原则

这是一个独立类别，但必须遵循严格安全边界。

禁止通过以下方式优化：

```text
❌ 缓存 authorization result
❌ 跳过 token validation
❌ 跳过 CSRF
❌ 跳过 Origin validation
❌ 放宽 RLS
❌ 绕过 recent MFA
❌ 减少权限检查
❌ 自动重放不安全 mutation
```

允许优化：

```text
✓ 减少重复网络调用
✓ 并行独立请求
✓ query/index 优化
✓ cursor pagination
✓ lazy rendering
✓ bundle 优化
✓ connection reuse
✓ backpressure
✓ streaming
✓ telemetry-based optimization
```

## 10.2 Frontend Performance

关注：

- JS bundle
- client component 边界
- unnecessary rerender
- large list rendering
- skeleton vs blocking spinner
- route prefetch
- image / asset
- client filtering

## 10.3 BFF

重点审查：

```text
Browser
 ↓
Next BFF
 ↓
Account API
 ↓
DB / Storage
```

寻找：

- 重复 principal request
- 串行但可并行的 API
- 不必要的 JSON serialization
- 多余 hop
- duplicated validation

注意：

> “重复验证”只有在明确属于同一 trust boundary 且安全模型允许时才能重构，不能直接删除。

## 10.4 Account API

建议把：

- authentication
- authorization
- request context
- operation context
- concurrency control

设计成单次请求内可复用的信息，而不是跨请求缓存授权结果。

## 10.5 Database

严格采用：

```text
Slow query
 ↓
EXPLAIN ANALYZE
 ↓
Query rewrite / Index
 ↓
Benchmark
```

而不是凭感觉加 index。

关注：

- platform/account lookup
- file status
- entitlement effective ranges
- redemption batch
- cleanup
- pagination cursor

## 10.6 Pagination

优先 cursor，而不是不断增加 limit。

```text
Admin list
Files
Audit log
Batches
```

最终都应该有一致 pagination contract。

## 10.7 Performance Metrics

建立：

```text
p50
p95
p99
```

分层：

```text
Browser → BFF
BFF → Account API
Authorization
DB
Storage
Total
```

没有 telemetry 之前不要进行大规模“性能重构”。

## 10.8 后续专题

`08-performance-scalability-optimization.md`

## 10.9 优先级

**P1 / P2**

---

# 11. 横向安全原则

所有类别都必须遵循统一安全原则。

## 11.1 不可牺牲项

```text
Authentication
Authorization
RLS
CSRF
Origin
MFA
Recent authentication
Idempotency
Optimistic concurrency
Input validation
File validation
Rate limiting
Security audit
```

## 11.2 性能与体验改造必须满足

```text
更快 ≠ 少做权限验证
更顺滑 ≠ 自动重放高风险操作
更方便 ≠ 暴露长期 credential
更少错误 ≠ 吞掉安全错误
```

## 11.3 优化目标

应该是：

```text
Same Security
+ Better Architecture
+ Better UX
+ Better Observability
+ Better Performance
```

而不是：

```text
Better Performance
- Security
```

---

# 12. 类别之间的依赖关系

这 8 个类别不是完全独立的。

推荐依赖：

```text
          ┌────────────────────┐
          │ 01 Auth & Session  │
          └─────────┬──────────┘
                    │
                    ▼
          ┌────────────────────┐
          │ 04 API Contract    │
          └─────┬────────┬─────┘
                │        │
        ┌───────▼──┐  ┌──▼───────────┐
        │ 02 UX    │  │05 Observability│
        └─────┬────┘  └──────┬────────┘
              │              │
              ▼              │
        ┌──────────────┐      │
        │03 Workflows  │◄─────┘
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │06 Testing    │
        └──────┬───────┘
               │
      ┌────────┴───────────┐
      ▼                    ▼
┌─────────────┐     ┌───────────────┐
│07 Developer │     │08 Performance │
│ Experience  │     │ & Scalability │
└─────────────┘     └───────────────┘
```

说明：

- Auth 和 API Contract 是底层。
- UX 和 Observability 建立在统一 Contract 上。
- Business Workflow 建立在 Auth + UX + API Client 上。
- Testing 应覆盖所有层。
- DX 和 Performance 可以并行，但最好在基础架构稳定后深入。

---

# 13. 推荐实施阶段

## Phase 0：架构基线

目标：

- 明确不允许破坏的安全边界
- 建立错误码规范
- 建立 request ID
- 建立改造测试基线

产出：

```text
security-invariants.md
api-error-contract.md
baseline-test-matrix.md
```

---

## Phase 1：认证和 Contract

优化：

```text
Auth Session Manager
API Client
single-flight refresh
logout behavior
MFA recovery
ApiError
request_id
```

这是后续所有页面优化的基础。

---

## Phase 2：共享 UI 状态

实现：

```text
Loading
Empty
Error
Retry
Mutation Pending
Confirm
Toast
Support ID
```

先不深入改业务。

---

## Phase 3：逐业务模块治理

建议顺序：

```text
Files
 ↓
Subscription
 ↓
Admin Entitlements
 ↓
其他业务页面
```

每个模块都使用 Phase 1 / 2 的共享能力。

---

## Phase 4：Observability + Testing

建立：

```text
structured logs
metrics
E2E
contract tests
failure-path tests
mobile tests
```

完成后，系统才具备长期稳定迭代能力。

---

## Phase 5：DX

清理：

```text
.env.example
README
local startup
machine-specific paths
seed
test users
CI commands
```

---

## Phase 6：Performance

基于真实 telemetry 找瓶颈：

```text
measure
 ↓
identify
 ↓
optimize
 ↓
benchmark
 ↓
regression test
```

避免无数据支持的提前优化。

---

# 14. 推荐优先级总表

| 类别 | 优先级 | 原因 |
|---|---|---|
| 01 Authentication & Session | P0 | 影响全平台正确性和安全体验 |
| 04 API Contract & Shared Types | P0/P1 | 是所有前端/后端统一治理基础 |
| 02 Frontend Experience & State | P1 | 当前产品体验最明显短板 |
| 03 Business Workflow | P1 | 文件/权益/订阅需要产品化 |
| 05 Observability & Auditability | P1 | 没有它难以定位真实线上问题 |
| 06 Testing & Quality | P1 | 防止横向架构改造产生回归 |
| 07 Developer Experience | P1 | 降低开发成本和环境漂移 |
| 08 Performance & Scalability | P1/P2 | 应基于 telemetry 优化，不能牺牲安全 |

---

# 15. 后续每一个专题的统一分析模板

后面你每选一个类别，都建议用同一个模板做深度分析。

```markdown
# XXX Optimization

## 1. Scope
本次分析包含什么，不包含什么。

## 2. Current Architecture
当前代码结构和完整调用链。

## 3. Current Behavior
正常路径、失败路径、边界路径。

## 4. Problems
逐条列出问题。

## 5. Severity
P0 / P1 / P2 / P3。

## 6. Security Constraints
哪些安全行为不能被改变。

## 7. Target Architecture
最终目标。

## 8. Detailed Design
接口、状态机、模块、数据结构。

## 9. Migration Plan
按 PR / 阶段迁移。

## 10. Testing
Unit / API / DB / E2E / Security。

## 11. Observability
Log / Metric / Trace / Audit。

## 12. Acceptance Criteria
什么条件下算优化完成。
```

---

# 16. 推荐后续分析顺序

建议后续不要从某个具体页面开始，而按以下顺序逐类深入：

```text
第 1 个专题
Authentication & Session
        ↓
第 2 个专题
API Contract & Shared Types
        ↓
第 3 个专题
Frontend Experience & State
        ↓
第 4 个专题
Files
        ↓
第 5 个专题
Subscription
        ↓
第 6 个专题
Admin Entitlements
        ↓
第 7 个专题
Observability
        ↓
第 8 个专题
Testing
        ↓
第 9 个专题
Developer Experience
        ↓
第 10 个专题
Performance & Scalability
```

这样做的好处是：

- 避免同样的 fetch/auth/error 逻辑在多个页面重复重构。
- 每完成一个底层类别，后续多个业务模块同时受益。
- 性能优化放在 telemetry 建好之后，可以针对真实瓶颈，而不是猜测。
- 安全边界在最早阶段锁定，后续优化不容易误伤授权模型。

---

# 17. 最终目标架构

整个优化完成以后，可以把平台理解为下面几层：

```text
┌────────────────────────────────────┐
│             Admin / Consumer       │
│  Pages / UX / Business Workflows   │
└─────────────────┬──────────────────┘
                  │
┌─────────────────▼──────────────────┐
│ Shared Frontend Foundation         │
│                                    │
│ API Client                         │
│ Auth Session Manager               │
│ Error Presenter                    │
│ Async UI States                    │
│ Request ID                         │
└─────────────────┬──────────────────┘
                  │
┌─────────────────▼──────────────────┐
│ Next.js BFF                        │
│                                    │
│ CSRF / Origin                      │
│ Session                            │
│ Request Context                    │
│ Input Validation                   │
│ Backpressure                       │
└─────────────────┬──────────────────┘
                  │
┌─────────────────▼──────────────────┐
│ Account API / Domain               │
│                                    │
│ Authentication                     │
│ Authorization                      │
│ MFA / Recent Auth                  │
│ Domain Rules                       │
│ Idempotency                        │
│ Concurrency                        │
└──────────────┬──────────┬──────────┘
               │          │
        ┌──────▼───┐  ┌───▼────────┐
        │ Database │  │   Storage   │
        │   RLS    │  │ File Objects│
        └──────────┘  └─────────────┘

横向能力：

Observability
Testing
Security
Developer Experience
Performance Measurement
```

最终优化目标不是把每个页面独立“修漂亮”，而是建立一套稳定的共享基础：

> **认证统一、契约统一、错误统一、状态统一、日志统一、测试统一，然后业务页面自然变简单。**

这将比逐页修补更适合 Aisenhub Platform 后续长期演进。
