# Aisenhubplatform 全项目生产级全面审查报告

审查日期：2026-10-13  
审查基线：`65c52fb1162b549b2446550b2cda9367c94e9e4f`（`codex/opt-010-commercial-operations`）  
审查类型：生产级架构、安全性、可靠性、数据一致性与业务逻辑只读全面审查  
执行团队角色视角：独立软件审查团队（高级软件架构师、Senior Code Reviewer、QA/测试负责人、安全审计工程师、可靠性工程师、业务逻辑审查者）

---

## 1. 审查范围

本次审查覆盖 **Aisenhubplatform 全项目**的所有核心层级与代码资产：

| 层级 | 路径 / 模块 | 审查对象说明 |
| :--- | :--- | :--- |
| **应用与 BFF 层** | `apps/admin` | Next.js 管理端控制台、同源认证路由（`app/api/auth/*`）、资源代理 BFF（`app/api/v1/[...path]/route.ts`）、各业务 Feature 页面与状态管理 |
| **API 与网关层** | `supabase/functions/account-api` | Account API 与 Admin API 统一入口、分发逻辑（`account.ts`, `admin.ts`, `configs.ts`, `feedback.ts`, `files.ts`, `core.ts`） |
| **Webhook 入站** | `supabase/functions/billing-webhook` | 爱发电/通用 Provider Webhook 签名验证、Hash-only Inbox 入站、Job 入队 |
| **运维与 Worker** | `supabase/functions/maintenance` | Capability Token 路由、文件/反馈附件清理、账号保留清理、全局删除状态机（`identity.ts`）、计费对账与结算（`billing.ts`） |
| **共享域与工具** | `packages/domain`, `packages/shared`, `supabase/functions/_shared` | 上传限流与读取门禁（`upload.ts`）、爱发电适配器（`afdian.ts`）、Storage 适配器（`storage.ts`）、MFA 凭证 |
| **数据库模型与规则** | `supabase/migrations/*.sql` | 平台隔离表结构、RLS 策略、PostgreSQL `private` 领域函数、触发器、索引、角色授权（`account_executor`, `admin_executor`, `job_executor`, `billing_ingress`） |
| **跨模块合同与测试** | `contracts/`, `tests/`, 各包 `tests/` | OpenAPI 3.1 契约、Deno 集成测试、Vitest 单元测试、Spikes 验证脚本 |

---

## 2. 功能理解

### 2.1 正常调用链

1. **Consumer 终端调用链**：
   - 客户端携带平台密钥 `X-Platform-Key` 与 Supabase Auth Access Token 请求 `/v1/*` 接口；
   - `account-api`（运行在 Deno Edge 环境）在 `core.ts` 校验 Token 有效性与所属 `userId`、验证平台密钥状态；
   - 切换本地数据库会话角色为 `account_executor`，并调用私有函数（如 `private.account_principal`）；
   - 执行业务规则并生成领域事件/审计日志后，以标准化 DTO（如 `principalDto`, `entitlementDto`）返回客户端。
2. **Admin 管理端调用链**：
   - 管理员在浏览器操作，请求发送到同源 Admin BFF；
   - Admin BFF 验证 Origin 与 CSRF Token，校验 HttpOnly Cookie（`admin-access-token`、`admin-recent-proof`）；
   - BFF 通过 `isAllowedAdminPath` 显式路由白名单后，转发至中央 API；
   - 中央 API 验证管理员单例（`private.system_admin`）、会话有效性与 AAL2 / 近期证明，切换为 `admin_executor` 角色执行私有操作。
3. **第三方支付与入站任务链**：
   - Provider（爱发电等）推送 Webhook 到 `billing-webhook`；
   - Webhook 校验路径密钥与 RSA-SHA256 签名，切换为 `billing_ingress` 角色，写入 `billing_webhook_events` 并生成 `webhook_order_discovery` 处理任务；
   - `maintenance` Worker 持有 `billing` Capability Token 认领任务，在数据库事务外发起 Provider 订单反查与事实归一化，再通过 `private.billing_order_verify_and_settle` 在事务内完成账本核销与权益写入。
4. **生命周期与删除任务链**：
   - 用户申请注销或管理员批准全局删除；
   - 产生 `deletion_jobs`；
   - Worker 认领后分步推进：清理文件 -> 清理用户个人信息与配置 -> 解绑平台账号 -> 调用 Supabase Auth Admin API 删除身份 -> 结案。

### 2.2 核心状态模型

- **平台账户状态**：`active` $\rightarrow$ `suspended` $\rightarrow$ `closed`（`closed` 为终态，用户脱钩且不可恢复）。
- **用户身份生命周期**：`active` $\rightarrow$ `deleting`（进入 `deleting` 后全平台阻断操作）。
- **计费订单状态**：`pending` $\rightarrow$ `paid` $\rightarrow$ `verified` $\rightarrow$ `granted`；异常流可流转至 `review_required`、`resolved`、`expired`。
- **配置资源版本状态**：`draft` $\rightarrow$ `active` $\rightarrow$ `retired`（历史版本不可变，不可逆向流转）。
- **分布式任务租约**：`job_leases` 结合单调递增 `fencing_token` 确保过期租约被接管时旧 Worker 无法提交写操作。

### 2.3 权限边界与业务不变量

- **多平台强隔离**：数据操作严格以 `platform_id` 隔离，普通用户绝不能跨平台越权读取或篡改其他账户资产。
- **单例系统管理员**：仅配置在 `private.system_admin` 中的单个账号为管理员，需 AAL2 认证，涉及密钥和全局删除的高危操作强制 30 分钟内的 `recent-proof`。
- **权益计算唯一收口**：所有权益的增减、有效期限合并、永久会员保护全部收口在 PostgreSQL 事务内函数 `private.entitlement_apply`，TS 层仅做参数透传。
- **幂等性不变量**：相同平台、同一操作与相同请求 Hash 在 7 天有效期内，重复提交必须返回完全相同的业务结果。

---

## 3. 总体结论

| 级别 | 数量 | 核心风险特征 |
| :---: | :---: | :--- |
| **P0 / Critical** | **0** | 本轮未发现未经认证即可直接执行任意 SQL 注入或普通用户直接提权为管理员的致命漏洞。 |
| **P1 / High** | **3** | 全局删除 Worker 重试 404 死锁永久卡死；爱发电 Webhook 状态变化/重试触发 Hash 冲突导致订单永久停滞；兑换码核心入口无任何速率限制存在暴力枚举与爆破风险。 |
| **P2 / Medium** | **5** | Stream 读取超时在 `finally` 中触发未捕获 `TypeError`；BFF 转发空请求体携带 Content-Type 导致上游 400；配置资源并发创建突破插槽配额；反馈孤儿附件缺少反向对账；测试套件严重缺乏真实并发与失败恢复断言。 |
| **P3 / Low** | **4** | 平台账户列表深分页性能隐患；Admin BFF 正则大小写与 Query 参数透传风险；文件下载响应缺少 CSP 沙箱标头；MFA 会话刷新与近期证明静默过期造成操作表单丢失。 |

**当前模块综合风险等级：** **High (高风险)**  
*(注：项目核心安全防线与数据库角色隔离架构较为扎实，但外部集成异常处理、异步状态机回滚幂等性及高敏感入口的防爆破机制存在能够直接引发生产事故的缺陷。)*

---

## 4. 问题清单

### ISSUE-001：Global Delete Worker 在 Supabase Auth 用户删除重试时遭遇 404 导致删除任务永久死锁
- **严重程度：** P1
- **类型：** 数据一致性 / 异常恢复 / 外部服务协同
- **位置：**
  - `supabase/functions/maintenance/core.ts` (`authAdminAdapter.deleteUser`)
  - `supabase/functions/maintenance/identity.ts` (`deletionJobAuth`)
- **证据：**
  `core.ts` 第 126-129 行：
  ```ts
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`AUTH_DELETE_FAILED_${response.status}`);
  }
  ```
  `identity.ts` 第 202-220 行：
  ```ts
  let failureCode: string | null = null;
  try {
    await (dependencies.authAdapter ?? authAdminAdapter()).deleteUser(userId);
  } catch (error) {
    failureCode = errorCode(error);
  }
  const [step] = await withJobRole(db, (transaction) =>
    transaction.unsafe<Row>(
      'select * from private.deletion_job_step(..., $7::text, $8::text, $9::text)',
      [..., 'auth_deleted', failureCode ? 'blocked' : 'completed', failureCode],
    ),
  );
  ```
- **当前行为：**
  当调用 Supabase Auth Admin API 删除用户时，若服务端返回任何 `!response.ok`，代码一律抛出 `AUTH_DELETE_FAILED_${response.status}`，导致 `deletion_job_step` 将当前任务标记为 `blocked`。
- **触发条件：**
  首次调用 `deleteUser` 时已在 Supabase 侧成功删除用户，但因网络抖动、响应超时（`AbortSignal.timeout(5000)`）导致 Worker 判定失败；或者在任务重试期间该用户已提前不存在。
- **复现步骤：**
  1. 创建全局删除任务，Worker 执行到 `deletionJobAuth` 步骤；
  2. Worker 向 Supabase Auth 发起 `DELETE /auth/v1/admin/users/:id`，Supabase 删除了用户，但连接在握手结束前断开触发超时；
  3. Worker 捕获异常并将步骤置为 `blocked`；
  4. 运维触发重试或 Worker 再次调度该任务，向 Supabase 发送同样的删除请求；
  5. Supabase Auth 返回 `404 Not Found`；
  6. `authAdminAdapter` 抛出 `Error("AUTH_DELETE_FAILED_404")`，步骤再次被置为 `blocked`。
- **实际影响：**
  该用户的全局删除任务**永久卡死在 blocked 状态**，无法完成 `completed` 终态。同时本地数据库已在 `auth_prepare` 中将关联账户置为脱钩匿名状态，造成控制台出现无法消除的幽灵故障任务。
- **根因分析：**
  DELETE 操作缺乏幂等性吸收（Idempotent Absorption）。对于资源删除操作，下游返回 404 代表目标资源已不存在，在语义上属于“删除成功”，不应将其判定为不可恢复的致命失败。
- **推荐修复方向：**
  在 `authAdminAdapter.deleteUser` 中，当 `response.status === 404` 时，应判定为幂等成功并正常返回 `void`，不抛出异常。
- **建议补充测试：**
  在 `supabase/functions/maintenance/index.test.ts` 中增加测试用例：模拟 Auth API 返回 404 时，`deletionJobAuth` 应当顺利推进至 `auth_deleted` = `completed`。

---

### ISSUE-002：爱发电 Webhook 在订单重复推送或状态变化时触发 Hash 冲突导致订单永久进入人工审核
- **严重程度：** P1
- **类型：** 业务逻辑 / 第三方协同 / 订单推进阻断
- **位置：**
  - `supabase/functions/_shared/afdian.ts` (`parseAfdianWebhook`)
  - `supabase/functions/billing-webhook/index.ts` (`handleBillingWebhookRequest`)
  - `supabase/migrations/20260914050122_repair_task_0305.sql` (`private.billing_webhook_ingest`)
- **证据：**
  `afdian.ts` 第 276 行：
  ```ts
  const eventKey = `afdian:${orderNo}`;
  return { order, orderNo, eventKey };
  ```
  `billing-webhook/index.ts` 第 199 行：
  ```ts
  const payloadHash = await sha256Bytes(bytes); // 整个原始 HTTP 请求体 bytes 的 SHA-256
  ```
  `repair_task_0305.sql` 第 72-85 行：
  ```sql
  if v_event.payload_hash <> p_payload_hash then
    insert into public.billing_webhook_event_conflicts (...) values (...);
    update public.billing_webhook_events
    set processing_status = 'manual_review', error_code = 'WEBHOOK_PAYLOAD_CONFLICT'
    where id = v_event.id;
    return query select v_event.id, v_job.id, false, 'manual_review'::text;
    return;
  end if;
  ```
- **当前行为：**
  系统以 `afdian:${orderNo}` 作为唯一的入站事件键（`eventKey`），但却对**整个原始 HTTP 请求报文**计算 SHA-256 Hash。一旦同一个 `orderNo` 再次收到 Webhook 且报文内容与前一次有任何字节差异，数据库立即将事件打上 `manual_review` 并终止自动结算。
- **触发条件：**
  爱发电网关在订单状态发生流转时重复发送 Webhook（例如由未支付变为已支付，或附带动态重试时间戳），或者网络重试时序列化 JSON 键序/空格不一致。
- **复现步骤：**
  1. 用户发起爱发电购买，爱发电首次发送订单通知，请求体 Hash 为 `Hash_A`，系统入库 `queued`；
  2. 用户完成付款，爱发电再次推送同一订单 `orderNo` 的支付通知，请求体包含更新的状态或时间戳，请求体 Hash 为 `Hash_B`；
  3. Webhook 入站调用 `private.billing_webhook_ingest`；
  4. 发现 `v_event.payload_hash <> p_payload_hash`；
  5. 数据库将事件状态更新为 `manual_review`，`billing-webhook` 向上游返回 HTTP 409。
- **实际影响：**
  自动结算与权益发放流程永久中断，用户的订阅权益**无法自动到账**；爱发电平台收到 HTTP 409 持续告警重试，造成人工客服与运维介入成本急剧上升。
- **根因分析：**
  事件幂等键与防篡改 Hash 的边界定义错位。既然 `eventKey` 被绑定到不可变的业务订单维度，防篡改比对应当针对该平台规范签名的**核心事实摘要（Signed Canonical Facts）**，而不是对易变的 HTTP 传输层原始字节做全量比对。
- **推荐修复方向：**
  1. 对爱发电 Webhook，Hash 的计算对象应改为签名覆盖的稳定事实组合（`out_trade_no`, `user_id`, `plan_id`, `total_amount`）；
  2. 或者当 `orderNo` 相同但 Hash 不同时，若已签名事实一致且订单状态更新为有效支付，应允许推进状态而不是直接锁死为 `manual_review`。
- **建议补充测试：**
  在 `supabase/functions/billing-webhook/index.test.ts` 中增加针对同一订单号包含不同时间戳或状态字段的两次有效签名推送测试，验证系统不会锁死进入 `manual_review`。

---

### ISSUE-003：兑换码兑换接口缺乏速率限制，存在暴力穷举与数据库锁拒绝服务攻击风险
- **严重程度：** P1
- **类型：** 安全防御缺失 / 业务逻辑漏洞 / 资金与权益防护
- **位置：**
  - `supabase/functions/account-api/account.ts` (`v1/subscription/redeem`)
  - `supabase/migrations/20260908103340_m3_dual_secret_redeem.sql` (`private.redeem_subscription_code_candidates`)
- **证据：**
  在全工程迁移文件中，`private.rate_limit_consume` 仅被配置于 `config-resources` 模块：
  `20261011025311_config_resource_domain_functions.sql` 第 959 行：
  ```sql
  select * into v_result from private.rate_limit_consume(v_key, v_window, p_window_seconds, p_limit_count);
  ```
  而在兑换码兑换函数 `private.redeem_subscription_code_candidates` 中，从开始校验到结束，**没有任何速率限制调用**。
- **当前行为：**
  任何通过普通用户认证的客户端均可无限制、高频调用 `POST /v1/subscription/redeem`。兑换失败时，函数仅向 `redemption_events` 表写入一行 `rejected` 记录，并以 409 结束，不执行任何频次封禁或指数退避。
- **触发条件：**
  恶意用户使用脚本并发尝试猜解兑换码。
- **复现步骤：**
  1. 攻击者注册普通账号登录并获取合法 Bearer Token；
  2. 使用自动化并发脚本请求 `/v1/subscription/redeem`，每次传入新生成的随机 `Idempotency-Key` 和猜解的 `code`；
  3. API 持续以极高吞吐处理请求（执行 HMAC、加锁查询、写事件表）。
- **实际影响：**
  1. 高价值订阅兑换码（月卡、年卡、终身会员）面临被字典攻击或暴力碰撞破解的直接风险；
  2. 每次请求执行 `select ... from public.platform_accounts ... for update` 会引发严重的数据库锁争用与 CPU 飙升，导致正常用户无法正常访问。
- **根因分析：**
  安全门禁覆盖不均。系统实现了 `rate_limit_consume` 基础设施，并在非核心的配置资源分享功能上使用了该能力，但在涉及真金白银权益的兑换码核心入口反而遗漏了接入。
- **推荐修复方向：**
  在 `private.redeem_subscription_code_candidates` 开头引入针对 `platform_account_id` 及全局 IP 维度的频次限制（如每账号每小时最多允许尝试 5-10 次失败，超出后直接抛出 `rate_limited` 429 错误）。
- **建议补充测试：**
  在 API 测试套件中增加并发高频兑换测试，断言连续多次输入错误兑换码后接口必须返回 HTTP 429 `RATE_LIMITED`。

---

### ISSUE-004：流式读取超时时 `finally` 块内 `releaseLock()` 抛出未捕获 `TypeError`
- **严重程度：** P2
- **类型：** 异常处理 / 健壮性 / Stream 生命周期管理
- **位置：**
  - `packages/domain/src/upload.ts` (`readBoundedBody`)
- **证据：**
  `packages/domain/src/upload.ts` 第 65-103 行：
  ```ts
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void reader.cancel('upload receive timeout').catch(() => undefined);
        reject(new UploadFault('STORAGE_UNAVAILABLE', 503));
      }, timeoutMs);
    });
    ...
    await Promise.race([read, timeout]);
    ...
  } catch (error) {
    if (error instanceof UploadFault) throw error;
    throw new UploadFault('STORAGE_UNAVAILABLE', 503);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    reader.releaseLock(); // <--- 未捕获异常源
  }
  ```
- **当前行为：**
  当流读取超时发生时，`reader.read()` 仍在挂起等待。`Promise.race` 立即随 `timeout` 抛出 `UploadFault`。随后进入 `finally` 块，执行 `reader.releaseLock()`。
- **触发条件：**
  客户端网络极慢（Slowloris 传输）或传输中断，导致 `readBoundedBody` 达到 `timeoutMs`（15秒）。
- **复现步骤：**
  1. 客户端发起上传请求并建立流连接，发送少量字节后停顿不发送也不关闭连接；
  2. 15,000ms 后超时定时器触发，`timeout` Promise 执行 `reject`；
  3. 执行 `finally` 块中的 `reader.releaseLock()`；
  4. 根据 WHATWG Streams 规范，在读取挂起时调用 `releaseLock()` 直接抛出 `TypeError: Cannot release a lock on a stream which has pending read operations`。
- **实际影响：**
  `finally` 抛出的裸 `TypeError` 会**直接覆盖并抑制**原本在 `try/catch` 中正确构造的 `UploadFault('STORAGE_UNAVAILABLE', 503)` 业务异常，导致 BFF 或 Edge Function 捕获到非预期的系统级 TypeError，可能退化为未受控的 500 崩溃或未捕获的 Promise 错误。
- **根因分析：**
  Stream Reader 锁释放未做防御性容错。当 reader 正处于 pending read 状态时，必须先等待取消/拒绝完成，或者在 releaseLock 外层捕获并忽略该 TypeError。
- **推荐修复方向：**
  在 `finally` 中将释放锁逻辑包裹在安全块中：
  ```ts
  finally {
    if (timer !== undefined) clearTimeout(timer);
    try {
      reader.releaseLock();
    } catch {
      // 忽略因流正在取消或处于挂起读取状态而导致的锁释放错误
    }
  }
  ```
- **建议补充测试：**
  针对真实网络 ReadableStream 构造一个挂起未关闭的输入流，验证超时后抛出的必须是 `UploadFault` 且其 code 为 `STORAGE_UNAVAILABLE`，不得泄漏 `TypeError`。

---

### ISSUE-005：Admin BFF 转发无请求体 Mutation 请求时保留 Content-Type 导致上游解析 400 失败
- **严重程度：** P2
- **类型：** 前后端协作 / 契约一致性 / API 边界容错
- **位置：**
  - `apps/admin/app/api/v1/[...path]/route.ts` (`dispatch`)
  - `supabase/functions/account-api/core.ts` (`body`)
- **证据：**
  `route.ts` 第 173-187 行：
  ```ts
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;
  ...
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body:
      mutation && request.body
        ? new TextDecoder().decode(
            (await readBoundedBody(request, 65_536, 15_000, true)).bytes,
          )
        : undefined,
    signal: accountApiSignal(),
  });
  ```
- **当前行为：**
  当客户端发起 POST/PUT 等 Mutation 请求但请求体为空（或空流）时，若浏览器或客户端库默认附带了 `Content-Type: application/json` 请求头，BFF 会无条件保留该请求头，同时向 Node `fetch` 传递 `body: undefined`。
- **触发条件：**
  前端某些动作（如无额外参数的状态变更、重试、关闭操作）发起 POST 请求且未显式指定 `{ body: '{}' }`，但设置了 `Content-Type: application/json`。
- **复现步骤：**
  1. 通过 Admin 前端或脚本发起无 Body 的 POST 请求，如 `POST /admin/api/v1/platforms/:id/keys/:id/confirm-deployment`，Header 携带 `Content-Type: application/json`；
  2. BFF 读取到 `request.body` 为空，转发给上游网关时带上 `Content-Type: application/json` 与空请求体；
  3. 上游 `account-api` 在执行 `readBoundedJson` 时因为无数据抛出 `UploadFault('INVALID_INPUT', 400)`。
- **实际影响：**
  原本合法的操作请求因空 Body 与 Header 的轻微不匹配被直接拒绝为 400 `INVALID_INPUT`，前端无法完成状态流转。
- **根因分析：**
  BFF 在重组上游请求时，没有将 Header 与实际转发的 Body 内容对齐。当 `body` 最终为 `undefined` 时，不应盲目透传 `Content-Type`。
- **推荐修复方向：**
  在 `route.ts` 中，当 `mutation && request.body` 为假或最终转发的 body 为空时，若无实际 payload，应删除 `Content-Type` 请求头，或者对允许空体的动作统一归一化为 `{}` 或空 Buffer。
- **建议补充测试：**
  在 `route.test.ts` 中补充测试用例：测试当客户端发送带 `Content-Type: application/json` 但 Body 为空的 POST/PATCH 请求时，转发行为符合预期且上游不抛错。

---

### ISSUE-006：配置资源并发创建存在 Check-Then-Act 漏洞，可突破账户插槽上限配额
- **严重程度：** P2
- **类型：** 并发与竞态 / 数据一致性 / 配额控制失效
- **位置：**
  - `supabase/migrations/20261011025311_config_resource_domain_functions.sql` (`private.config_create`)
- **证据：**
  在 `private.config_create` 中：
  ```sql
  select count(*) into v_existing_count
  from public.platform_config_resources r
  where r.platform_id = (p_ctx).platform_id and r.platform_account_id = v_account.id
    and r.status <> 'deleted';
  if v_existing_count >= v_slot_limit then
    raise exception using errcode = 'P0001', message = 'config_slot_limit_exceeded';
  end if;
  ```
- **当前行为：**
  在执行 `select count(*)` 统计现有资源数量时，未对所属账户或行集加上互斥锁（如对 `platform_accounts` 执行 `for update`）。
- **触发条件：**
  同一个账户在接近上限（如上限为 10，当前已有 9 个）时，同时并发发出两个或多个创建资源的 POST 请求。
- **复现步骤：**
  1. 当前账户拥有 9 个配置资源，配额上限为 10；
  2. 客户端几乎同一毫秒发送 2 个不同的 `config_create` 请求；
  3. 事务 T1 执行 `select count(*)` 得到 9，通过检查；
  4. 事务 T2 同时执行 `select count(*)` 也得到 9，通过检查；
  5. T1 插入第 10 个配置资源并提交；
  6. T2 随后插入第 11 个配置资源并提交。
- **实际影响：**
  账户成功创建了 11 个资源，**突破了平台配置的配额硬限制**。
- **根因分析：**
  标准的 Check-Then-Act 并发竞争条件。缺乏事务串行化保证或悲观锁同步。
- **推荐修复方向：**
  在进行 `select count(*)` 之前，显式锁住该平台账户行：
  ```sql
  perform 1 from public.platform_accounts a
  where a.platform_id = (p_ctx).platform_id and a.id = v_account.id for update;
  ```
  通过账户级悲观锁确保对该账户的配额变更串行化执行。
- **建议补充测试：**
  编写并发 spike 测试：使用并发客户端在配额临界点同时发起 5 个创建请求，断言最终落地数量绝不超过上限，超出部分必须被 `config_slot_limit_exceeded` 拒绝。

---

### ISSUE-007：Feedback 附件上传存在 Storage 成功但数据库失败时的孤儿文件永久残留
- **严重程度：** P2
- **类型：** 数据一致性 / 存储资源泄漏 / 故障恢复缺失
- **位置：**
  - `supabase/functions/account-api/files.ts` (`handleFeedbackAttachmentUploadContent`)
  - `supabase/functions/maintenance/files.ts` (`cleanupFeedbackAttachment`)
- **证据：**
  在 `handleFeedbackAttachmentUploadContent` 中，执行顺序为：
  1. 调用 `feedback_attachment_prepare_store` 获取授权与路径；
  2. 执行 `adapter.upload(...)` 将二进制流写入 Supabase Storage 私有桶；
  3. 调用数据库 `feedback_attachment_finalize` 确认归档。
  若第 2 步成功，第 3 步发生数据库超时或断连：
  客户端收到 503，数据库事务回滚，附件状态保持在未完成。
- **当前行为：**
  `maintenance` 中的附件清理逻辑仅扫描数据库中的 `platform_feedback_attachments` 表已存在的记录。如果数据库事务完全回滚或在极早期未产生有效索引行，Storage 中已物理写入的文件在数据库中无任何记录可查。
- **触发条件：**
  大文件或网络波动场景下，Storage 上传成功后数据库网络超时。
- **复现步骤：**
  1. 上传反馈附件；
  2. 模拟 Storage 写入成功返回 200，随后断开与 PostgreSQL 的连接；
  3. 请求失败，但 Storage 桶中已多出该文件；
  4. 运行 `maintenance` 清理任务。
- **实际影响：**
  私有 Storage 桶中产生无主孤儿文件，长期累积会造成云存储容量膨胀与费用增加。
- **根因分析：**
  缺乏双向存储对账机制（Storage Bucket Reconciliation）。清理逻辑只做“数据库驱动的存储删除”，不做“存储桶未索引文件的对账回收”。
- **推荐修复方向：**
  1. 在 `feedback_attachment_prepare_store` 阶段必须保证数据库状态为持久化的 `uploading` 并持久化记录对应 storage path；
  2. 在 `files.ts` 的 catch 块中，尝试对已上传的 storage path 执行最佳努力的补偿性删除；
  3. 定期运行包含 Storage 对账的扫描任务。
- **建议补充测试：**
  增加补偿测试用例：验证若 finalize 抛错，adapter 是否会收到删除该临时路径的调用。

---

### ISSUE-008：测试套件严重缺乏针对真实并发冲突、幂等性重放与边界异常的负向断言
- **严重程度：** P2
- **类型：** 测试覆盖不足 / 质量防护盲区
- **位置：**
  - `supabase/functions/account-api/index.test.ts`
  - `apps/admin/**/*.test.ts`
- **证据：**
  当前虽然测试覆盖了 111 个 Deno 测试与 68 个 Vitest 测试，但绝大部分测试均为单线程 Happy Path 或针对简单格式输入的参数校验测试：
  - 没有针对两个并发请求争抢同一个兑换码的并发测试；
  - 没有针对结算 Worker 在 Lease 过期被新 Worker 接管（Fence 冲突）时的并发竞争测试；
  - 没有针对 Storage 503 异常下数据库状态完整性的负向集成测试。
- **当前行为：**
  现有自动化测试即使在业务代码被篡改（如去除 SQL 中的 `for update` 或在事务中跳过状态校验）时，测试依然全部变绿。
- **实际影响：**
  团队产生“测试全部通过即代码生产就绪”的虚假安全感，导致并发竞争、幂等击穿和锁死等真正高风险问题只能在真实生产流量下暴露。
- **推荐修复方向：**
  建立针对数据一致性与并发竞争的专项集成测试集（Concurrency & Chaos Specs），包括双重抢兑、租约抢占和网络超时回滚断言。

---

### ISSUE-009：Platform Account Workbench 缺少深分页限制，大偏移查询存在数据库连接池耗尽风险
- **严重程度：** P3
- **类型：** 性能隐患 / 数据库拒绝服务
- **位置：**
  - `supabase/migrations/20261012043000_platform_account_workbench_domain.sql`
  - `supabase/functions/account-api/admin.ts`
- **证据：**
  管理端工作区查询支持 offset/limit 分页，尽管限制了单页最大 `limit = 100`，但未限制最大 `page` 或 `offset` 深度。
- **当前行为：**
  当匹配的数据量达到数万或数十万时，高偏移量（如 offset 50,000）会导致 PostgreSQL 进行昂贵的扫描排序后丢弃前 50,000 行。
- **触发条件：**
  数据量增长后，管理员或爬虫通过脚本请求深层分页页面。
- **实际影响：**
  占用大量数据库内存和临时磁盘排序空间，引发查询超时，阻塞数据库连接池中的其他关键业务。
- **推荐修复方向：**
  1. 限制传统分页的最大允许页数（如最多查前 100 页）；
  2. 对于大批量检索，全面推行基于 Keyset（游标）的分页模式。

---

### ISSUE-010：Admin BFF 正则与下游 UUID 校验存在大小写敏感性分歧
- **严重程度：** P3
- **类型：** 契约与输入验证 / 健壮性
- **位置：**
  - `apps/admin/app/api/v1/[...path]/route.ts`
  - `supabase/functions/account-api/core.ts`
- **证据：**
  BFF 中定义：
  ```ts
  const resourceId = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
  ```
  而在 Deno 核心与数据库函数中，UUID 被统一要求或转为小写。
- **当前行为：**
  带有大写字母的 UUID 能通过 BFF 的 Allowlist 校验，进入下游后部分依赖原始字符串匹配的地方可能出现细微行为不一致。
- **推荐修复方向：**
  在 BFF 校验并分发时统一将 URL 路径中的 UUID 归一化为全小写。

---

### ISSUE-011：私有二进制文件下载响应缺失 CSP 沙箱隔离标头
- **严重程度：** P3
- **类型：** 安全防护 / 浏览器防御
- **位置：**
  - `apps/admin/app/api/v1/[...path]/route.ts`
  - `supabase/functions/account-api/files.ts`
- **证据：**
  文件下载与附件内容返回的标头包含 `X-Content-Type-Options: nosniff` 和 `Content-Disposition: attachment`，但未配置 `Content-Security-Policy: sandbox; default-src 'none'`。
- **实际影响：**
  若上传包含 HTML/SVG 脚本的恶意文件且被用户在某些非标准浏览器中直接预览，存在同源脚本执行（Stored XSS）的防御边界缺失。
- **推荐修复方向：**
  在文件和附件内容响应头中增加 `Content-Security-Policy: sandbox; default-src 'none'`。

---

### ISSUE-012：Admin MFA 验证与近期证明静默过期导致表单填写状态丢失
- **严重程度：** P3
- **类型：** 用户体验 / 认证状态同步
- **位置：**
  - `apps/admin/app/api/auth/refresh/route.ts`
- **证据：**
  会话刷新（Token 自动续期）正常进行，但 30 分钟的 `recentProof` 在静默中过期，前端 UI 没有任何预警或近过期提示。
- **实际影响：**
  管理员在管理后台输入了大量复杂的配置或审核意见，点击最终提交时因 `RECENT_MFA_REQUIRED` 被拦截，页面若处理不当会导致操作员已填写的表单内容丢失。
- **推荐修复方向：**
  前端引入近期证明有效倒计时感知或在关键操作发起前预检，并在需要重新验证时提供无缝弹出弹窗与保留原表单草稿的能力。

---

## 5. 测试覆盖缺口

经对全工程测试用例的反向审查，以下关键生产场景目前**完全没有自动化测试覆盖**，属于重大质量盲区：

1. **极端并发与双重支出（Double Spending / Race Condition）**：
   - 两个并发请求携带不同的 `Idempotency-Key` 同时兑换同一张有效兑换码；
   - 两个并发请求在账户配额临界点同时创建配置资源（突破 slot limit）；
   - 并发触发同一个订单的 Webhook 入站与结算对账。
2. **分布式租约接管与 Fencing 冲突（Fencing Stale Recovery）**：
   - 模拟 Worker A 认领任务后由于 GC 或网络卡顿暂停，租约过期，Worker B 获取新 Fence 抢占并完成任务；Worker A 恢复后尝试提交写操作，断言数据库必须拒绝 Worker A（抛出 `stale_job_fence`）。
3. **外部网络中途断开与半成功状态恢复（Partial Failure Recovery）**：
   - 全局删除过程中，Auth API 真实删除了用户但网络连接超时中断，断言下一次重试必须顺利闭环而不是卡在 blocked；
   - Feedback 上传过程中 Storage 成功但数据库超时，断言系统具备补偿机制。
4. **暴力破解与安全速率限制（Brute Force & Rate Limiting）**：
   - 高频连续调用兑换码、密码登录、MFA 验证接口，断言超过阈值后必须返回 HTTP 429。
5. **Slowloris 慢速网络上传（Stream Timeout Abort）**：
   - 客户端故意以超慢速或挂起方式发送 Body，验证 15 秒后触发 503 且不得产生未捕获的运行时 TypeError。

---

## 6. 架构与技术债

1. **单管理员（Singleton Admin）模型的单点故障风险**：
   - 当前架构将管理员严格限制为单例（`private.system_admin.singleton_id = 1`），且目前不支持备用多因素验证因子或应急恢复码（Recovery Keys）。一旦该管理员 TOTP 设备遗失，只能由持有数据库主密钥的运维人员直连生产数据库手动操作，缺乏高可用身份恢复协议。
2. **PostgreSQL 私有函数体积庞大与可观测性不足**：
   - 部分迁移文件（如 `config_resource_domain_functions.sql` 超过 1600 行，`feedback_domain_functions.sql` 超过 1100 行）包含了大量复杂的业务分支与状态转换，PL/pgSQL 内部的调试、日志记录与行级覆盖率测量难度极大。
3. **缺少针对 Storage 的双向对账机制**：
   - 目前系统的对账机制主要覆盖了 Billing 订单（爱发电双游标对账），但对于私有文件桶（`platform-config-files`）缺乏定期的物理存储与数据库元数据一致性扫描工具。

---

## 7. 无法确认的问题

| 编号 | 待确认事项 | 缺少的信息 / 上下文 | 判断依据与影响 |
| :---: | :--- | :--- | :--- |
| **UNC-01** | **爱发电真实生产 Webhook 是否包含动态未签名键** | 缺少爱发电生产环境实际推送的 Raw 报文抓包记录 | 若爱发电官方在重试时仅改变 HTTP 标头而不改变 Body，则 ISSUE-002 的触发频率较低；但若报文中携带动态时间戳或重试序号，则该问题在生产会百分之百触发。 |
| **UNC-02** | **CDN / 反向代理层的 WAF 速率限制策略** | 生产部署的 Cloudflare / CDN 或网关配置文件未纳入仓库版本管理 | 兑换码接口在应用层缺乏速率限制，若线上边缘节点（CDN WAF）配置了每 IP 严格的请求频次限制，可在一定程度上缓解暴力破解，但无法替代应用层 per-account 的防爆破规则。 |

---

## 8. 修复优先级

在获得用户确认并进入下一阶段修改之前，建议采用三批次推进策略：

### 第一批：立即修复（阻断生产事故与死锁）
- **ISSUE-001**：在 `authAdminAdapter` 中处理 Supabase Auth 返回的 404，消除全局删除重试死锁；
- **ISSUE-002**：重构爱发电 Webhook 冲突比对逻辑，将全量 Byte Hash 比对调整为核心已签名订单事实摘要，防止真实订单锁死；
- **ISSUE-003**：在 `private.redeem_subscription_code_candidates` 中接入 `rate_limit_consume`，堵住兑换码暴力穷举漏洞。

### 第二批：中期加固（提升可靠性与数据一致性）
- **ISSUE-004**：安全包裹 `readBoundedBody` 中 `finally` 块的 `releaseLock()`，防止超时抛出未捕获 TypeError；
- **ISSUE-005**：修复 Admin BFF 在转发空 Body 请求时的 Content-Type 透传行为；
- **ISSUE-006**：在配置资源创建流程中对账户行加锁，消除并发突破配额插槽的竞态条件；
- **ISSUE-007**：补充 Feedback 附件上传失败时的补偿性存储清理逻辑；
- **ISSUE-008**：补充关键并发与失败恢复负向集成测试。

### 第三批：长效优化（技术债与可维护性提升）
- **ISSUE-009**：为平台账户列表与检索引入最大分页深度限制与 Keyset 游标化演进；
- **ISSUE-010**：归一化 BFF 与下游之间的 UUID 大小写校验规则；
- **ISSUE-011**：在文件及附件下载响应头中注入 CSP 沙箱隔离标头；
- **ISSUE-012**：优化前端对近期 MFA 证明倒计时的感知，提供无缝续期与草稿防丢能力。

---
*本审查报告本轮仅陈述事实、证据、根因与建议，未对任何生产或测试代码执行修改。*

## 2026-10-14 实施核对

以上为历史静态审查快照，不代表当前风险或完成情况。已验证修复、未复现推论、Local 证据与发布阻塞统一见[预上线优化验证记录](../proposals/prelaunch-canonicalization-and-remediation/verification-record.md)。本轮没有把原报告的推断视为全部已证实缺陷。
