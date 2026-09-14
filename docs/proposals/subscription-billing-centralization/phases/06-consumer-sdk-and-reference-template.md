# RC-05：Consumer支付体验与BFF恢复

## 1. 阶段名称和状态

状态：Proposed／计划中；本轮只制定计划，所有修复实现未开始。当前派发以 TASK ID 为准，文件名为历史兼容路径。旧BILL记录只通过末尾归档链接引用，不是当前验收状态或执行授权。

## 2. 阶段目标

- 用目录和Checkout snapshot展示价格商品期限（TASK-0501）。
- 统一登录、平台激活与Session刷新恢复（TASK-0502）。
- 实现服务端Checkout创建与未知结果恢复（TASK-0503）。
- 治理重复点击和并行购买意图（TASK-0504）。
- 保留新标签页预开与弹窗拦截备用操作（TASK-0505）。
- 覆盖全部交易状态并区分当前生效（TASK-0506）。
- 处理网络失败、Provider超时与轮询预算（TASK-0507）。
- 恢复刷新、重进页面与跨Tab支付（TASK-0508）。
- 展示支付成功但权益延迟和未来Grant（TASK-0509）。
- 解释取消、退款、撤销和人工复核（TASK-0510）。
- 完成移动端键盘焦点与可访问性（TASK-0511）。
- 封堵用户界面与错误输出敏感信息（TASK-0512）。

## 3. 问题来源

[唯一问题表](../repair-issues.md)：F05,F09,F15,F16；[总计划](../plan.md)与[矩阵](../repair-matrices.md)。不在本阶段重复维护问题状态。

## 4. 前置依赖

RC-02/RC-03/RC-04的对应合同；可先做纯展示/可访问性。每个任务的前置比阶段概述更精确。依赖未过只做可独立准备；阶段集成验收必须前置全部满足。默认串行；计划不授权多Agent。

## 5. 明确不在本阶段处理的内容

不在浏览器计算权益/价格或放置Key，不用新订单掩盖旧订单未知结果。本轮只改proposal，不修改任何业务源码、迁移、配置、API、UI、测试，不commit/push。后续实现须另获任务派发。

## 6. 当前源码和配置证据

| 问题 | 基线证据 | 当前行为 |
| --- | --- | --- |
| F05 | `supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264` | 上轮 blocked/review_required 对应 Checkout pending；只成功路径写 granted；到期未形成完整状态 |
| F09 | `apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181` | 每次点击新UUID；成功响应后才持久化；取消仅清本地；Lifetime guard 与旧续购计划冲突，未完整分类异常 |
| F15 | `apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613` | 永久文案vs99年；只消费创建响应子集；同商品禁购；独立fetch未统一刷新；SDK目录方法无用户态输入 |
| F16 | `packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101` | 文档26载荷/AISEN前缀与实际31默认不同；Unicode空白规范化不同；未找到窗口限流调用；交付/过期/禁用需保留负向验收 |

## 7. 修改文件清单

下列为未来实施候选，历史迁移只读；本轮仅该阶段计划文件发生文档改动。

- `apps/template-preview/app/subscription/page.tsx`
- `apps/template-preview/app/api/v1/[...path]/route.ts`
- `tests/spikes/e2e/t16-r2-account.mjs`
- `packages/account-server/src/index.ts`
- `packages/account-server/tests/client.test.ts`
- `packages/account-auth-nextjs/src/browser.ts`
- `packages/account-auth/src/index.ts`
- `apps/template-preview/app/_lib/auth-session.ts`
- `packages/domain/src/contracts/billing.ts`
- `packages/domain/src/contracts/api.ts`
- `packages/i18n/src/index.ts`
- `supabase/functions/account-api/index.ts`
- `packages/domain/src/redemption.ts`

## 8. 数据库迁移清单

| 任务 | 迁移需求 | 生成/依赖/升级约束 |
| --- | --- | --- |
| TASK-0501 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0502 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0503 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0504 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0505 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0506 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0507 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0508 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0509 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0510 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0511 | 无 | 不改数据库；若需求变化先修计划。 |
| TASK-0512 | 无 | 不改数据库；若需求变化先修计划。 |

所有迁移先核对 `pnpm exec supabase --version`、`pnpm exec supabase migration new --help`，再用 `pnpm exec supabase migration new <已审核slug>`。尖括号为占位不可原样执行；本轮不运行生成命令，不手造时间戳。确认前置迁移已应用、旧函数最后定义、依赖视图/触发器、DDL锁时间、回填批量/检查点和权限负例。远程schema变更需实际授权；不使用linked reset。迁移实际文件清单在执行时追加verification-record，不以候选slug计已生成。

## 9. API/OpenAPI/DTO/SDK 影响

逐任务列出的合同文件必须与[影响矩阵](../repair-matrices.md)一起验收。新增字段采用兼容扩展；不得静默更名现有跨模块字段，`/v1/plans`不改义。没有独立Admin SDK包，使用现有Admin请求封装与中央API DTO。函数名称和最新重定义在实施前重新rg，不能照抄上轮概述中的简称。

## 10. Consumer/Admin UI 影响

- TASK-0501：Consumer—Free、月/年/99年均来自API，未来Grant不冒充当前方案；Admin—订单snapshot可与Admin对照。
- TASK-0502：Consumer—登录/激活/禁用/服务不可用有独立下一步；Admin—后台状态不被前端刷新修改。
- TASK-0503：Consumer—creating/unknown/created明确，用户不会被提示立即重付；Admin—可关联原Checkout而非新增孤单。
- TASK-0504：Consumer—不因busy永久锁死，结束后恢复焦点；Admin—重复真实款可见且不覆盖首笔。
- TASK-0505：Consumer—桌面和移动浏览器可继续付款；备用操作清楚；Admin—继续付款与重查均关联原单。
- TASK-0506：Consumer—支付成功不等于权益立即生效；Admin—人工原因以脱敏用户可见解释展示。
- TASK-0507：Consumer—告诉用户无需重复付款及何时联系处理；Admin—失败类别与运维记录能关联。
- TASK-0508：Consumer—刷新和跨Tab不要求用户重新下单；Admin—保留恢复事件线索，隐私数据不入日志。
- TASK-0509：Consumer—用户知道钱已收到、权益何时生效、异常下一步；Admin—提供脱敏支持编号。
- TASK-0510：Consumer—所有终止/人工状态有下一步；Admin—用户支持编号可定位订单与决策。
- TASK-0511：Consumer—移动端备用链接可用，屏幕阅读器区分处理中/成功/失败；Admin—不影响管理端共享组件回归。
- TASK-0512：Consumer—错误可理解且能恢复，不暴露内部异常；Admin—管理员仅见授权脱敏证据。

## 11. 详细执行步骤

执行每个已派发任务：基线和前置→保留失败用例→最小领域/合同改动→同步消费者→定向验证→记录失败恢复和交接。以下清单不自动授权连续执行整个阶段。

<a id="task-0501"></a>
### TASK-0501：用目录和Checkout snapshot展示价格商品期限

- 目标：页面金额/商品/期限与所购snapshot一致。
- 问题证据：F07：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:411; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:126; supabase/migrations/20260912150000_afdian_checkout_payment_link.sql:29`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F07,F15；Catalog/Snapshot、Consumer/SDK。
- 前置依赖：TASK-0201,TASK-0103。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`、`packages/account-server/src`、`packages/account-server/tests`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`、`packages/account-server/src/index.ts`、`packages/account-server/tests/client.test.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 目录展示服务端金额字符串/币种/期限/资格。
    2. 创建后付款摘要只用Checkout snapshot，文案改为99年有限期并展示实际截止或排期。
    3. 同步用户态目录SDK输入与Registry安装输出，不写死¥或通用feature承诺。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0501-NEG`；目录改价后旧单显示新价、99年标永久、匿名资格覆盖用户资格。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0501-REC`；目录请求与创建并发、切平台后旧响应返回。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：Free、月/年/99年均来自API，未来Grant不冒充当前方案。
- 管理员操作验收：订单snapshot可与Admin对照。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：页面金额/商品/期限与所购snapshot一致。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0502"></a>
### TASK-0502：统一登录、平台激活与Session刷新恢复

- 目标：只恢复本人会话和原意图，401不丢交易记录。
- 问题证据：F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`；F08：`supabase/migrations/20260911134658_bill_05_provider_verification_settlement.sql:82,104,125; supabase/migrations/20260908103340_m3_dual_secret_redeem.sql:48`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F15,F08；Consumer/SDK、权益/生命周期。
- 前置依赖：TASK-0103,TASK-0401。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`、`packages/account-auth-nextjs/src`、`packages/account-auth/src`、`apps/template-preview/app/_lib`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`、`packages/account-auth-nextjs/src/browser.ts`、`packages/account-auth/src/index.ts`、`apps/template-preview/app/_lib/auth-session.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 订阅请求改用既有认证会话封装和single-flight刷新。
    2. 未登录跳登录并使用安全returnTo，未激活提供显式激活。
    3. 暂停/关闭/删除及中央不可用分别反馈，不用Free缓存放行。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0502-NEG`；无效issuer/aud/exp/nbf/session、跨平台Key、刷新失败仍付款、恶意returnTo。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0502-REC`；两请求同时401、跨Tab退出、刷新成功但创建响应未知。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：登录/激活/禁用/服务不可用有独立下一步。
- 管理员操作验收：后台状态不被前端刷新修改。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：只恢复本人会话和原意图，401不丢交易记录。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0503"></a>
### TASK-0503：实现服务端Checkout创建与未知结果恢复

- 目标：同意图创建一次且失败可继续。
- 问题证据：F09：`apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F09,F15；Checkout幂等、Consumer/SDK。
- 前置依赖：TASK-0202,TASK-0502。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`、`packages/account-server/src`、`packages/account-server/tests`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`、`packages/account-server/src/index.ts`、`packages/account-server/tests/client.test.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 请求前保存无Secret的购买意图ID和幂等key，POST仅product_code。
    2. 展示creating并保存成功Checkout元数据。
    3. 断响应显示结果未知，用同key恢复或查询意图，不生成替代订单。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0503-NEG`；服务端提交成功客户端断网、body注入金额/账户/期限、空payment_url。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0503-REC`；重复网络重试共享同key，退出重进恢复意图。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：creating/unknown/created明确，用户不会被提示立即重付。
- 管理员操作验收：可关联原Checkout而非新增孤单。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：同意图创建一次且失败可继续。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0504"></a>
### TASK-0504：治理重复点击和并行购买意图

- 目标：同一意图无重复单；不同意图有明确提示和恢复位置。
- 问题证据：F09：`apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F09；Checkout幂等。
- 前置依赖：TASK-0202,TASK-0503。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 同步事件入口与busy避免同页重入。
    2. 用服务端待处理意图和账户命名空间协调不同Tab，不只依赖React状态。
    3. 对确实不同购买意图要求明确操作，Lifetime政策由D1结果决定。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0504-NEG`；双击/键盘连按/跨Tab不同key导致非预期多Checkout。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0504-REC`；同ms点击、两个窗口、取消后旧Tab恢复。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：不因busy永久锁死，结束后恢复焦点。
- 管理员操作验收：重复真实款可见且不覆盖首笔。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：同一意图无重复单；不同意图有明确提示和恢复位置。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0505"></a>
### TASK-0505：保留新标签页预开与弹窗拦截备用操作

- 目标：不遗留无法控制空白页，不创建新Checkout解决弹窗问题。
- 问题证据：F09：`apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F09,F15；Checkout幂等、Consumer/SDK。
- 前置依赖：TASK-0503。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 保留用户点击时预开窗口并断开opener。
    2. 创建后只导航服务端批准URL，失败关闭本次空白窗口。
    3. popup blocked提供同一Checkout继续付款链接，已付/过期停止再次签发。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0505-NEG`；window.open返回null、窗口已关闭、非法URL、已付仍显示可付链接。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0505-REC`；创建未回时关闭新页、返回原页重复打开。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：桌面和移动浏览器可继续付款；备用操作清楚。
- 管理员操作验收：继续付款与重查均关联原单。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：不遗留无法控制空白页，不创建新Checkout解决弹窗问题。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0506"></a>
### TASK-0506：覆盖全部交易状态并区分当前生效

- 目标：每个状态有独立断言和动作；用户文案可反查后端事实。
- 问题证据：F05：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F05,F15；Checkout/Consumer、Consumer/SDK。
- 前置依赖：TASK-0306,TASK-0501。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`、`packages/domain/src/contracts`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`、`packages/domain/src/contracts/billing.ts`、`packages/domain/src/contracts/api.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 逐字段消费付款/核验/处理/授予/有效权益投影。
    2. 实现pending、paid、verified、granted、active、retryable、manual_review、failed及expired/resolved映射。
    3. 未知状态保留订单并显示状态暂不可判断，不伪装失败或成功。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0506-NEG`；review后仍等待付款、未来Grant显示active、rejected finalized显示支付成功。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0506-REC`；查单响应乱序、首笔成功与第二笔人工、过期与迟到款。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：支付成功不等于权益立即生效。
- 管理员操作验收：人工原因以脱敏用户可见解释展示。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：每个状态有独立断言和动作；用户文案可反查后端事实。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0507"></a>
### TASK-0507：处理网络失败、Provider超时与轮询预算

- 目标：轮询有界无重叠，后台继续处理，手动恢复仍用原单。
- 问题证据：F02：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:532,562; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:59; supabase/functions/maintenance/index.ts:655,699`；F05：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F02,F05,F15；Job/Worker、Checkout/Consumer、Consumer/SDK。
- 前置依赖：TASK-0303,TASK-0506。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`、`packages/account-server/src`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`、`packages/account-server/src/index.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 将网络不可达与Provider未付分开。
    2. 轮询退避、总预算、取消与手动刷新保留且避免重叠请求。
    3. 展示最后确认时间和等待动作，不把浏览器轮询结束当Job失败。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0507-NEG`；超时/429/502/503、非JSON响应、连续失败后订单被清空。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0507-REC`；慢GET超过轮询间隔、卸载后返回、断网恢复。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：告诉用户无需重复付款及何时联系处理。
- 管理员操作验收：失败类别与运维记录能关联。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：轮询有界无重叠，后台继续处理，手动恢复仍用原单。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0508"></a>
### TASK-0508：恢复刷新、重进页面与跨Tab支付

- 目标：本人原单可恢复，别的账户订单不出现。
- 问题证据：F09：`apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F09,F15；Checkout幂等、Consumer/SDK。
- 前置依赖：TASK-0202,TASK-0503。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`、`packages/account-auth-nextjs/src`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`、`packages/account-auth-nextjs/src/browser.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 客户端存储按平台/账户命名空间且不保存付款Secret或敏感URL。
    2. 页面重进从认证服务端恢复待处理意图，处理旧sessionStorage迁移。
    3. 跨Tab用现有会话机制传播失效，交易一致性仍以服务端为准。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0508-NEG`；切账号读取前账号待付款、storage损坏、历史schema、URL长期保存。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0508-REC`；两Tab一付一取消、刷新时创建响应丢失、退出后旧请求返回。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：刷新和跨Tab不要求用户重新下单。
- 管理员操作验收：保留恢复事件线索，隐私数据不入日志。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：本人原单可恢复，别的账户订单不出现。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0509"></a>
### TASK-0509：展示支付成功但权益延迟和未来Grant

- 目标：UI、Grant区间与当前权益可逐项核对。
- 问题证据：F05：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F05,F15；Checkout/Consumer、Consumer/SDK。
- 前置依赖：TASK-0306,TASK-0506,TASK-0401。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. paid但未Grant显示核验/排队及最后状态。
    2. granted后读取effective subscription与starts_at/ends_at。
    3. 未来Grant展示计划生效日期和当前权益，提供查询/联系渠道。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0509-NEG`；paid显示已开通、grant future显示current、中央不可用回退伪Free。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0509-REC`；先查Checkout后Grant可见性、续期同Plan、多个未来Grant。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：用户知道钱已收到、权益何时生效、异常下一步。
- 管理员操作验收：提供脱敏支持编号。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：UI、Grant区间与当前权益可逐项核对。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0510"></a>
### TASK-0510：解释取消、退款、撤销和人工复核

- 目标：取消不丢交易，退款与权益状态分开展示。
- 问题证据：F03：`supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:68,95; supabase/migrations/20260911141438_bill_06_admin_billing_and_consumer_authorization.sql:297,364; supabase/functions/_shared/afdian.ts:365`；F05：`supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:438; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:204; apps/template-preview/app/subscription/page.tsx:264`；F09：`apps/template-preview/app/subscription/page.tsx:342,451; supabase/migrations/20260913130407_bill_19_lifetime_purchase_guard.sql:14; supabase/migrations/20260912142647_bill_13_afdian_sale_product_month_contract.sql:181`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F03,F05,F09；Order/Settlement/退款、Checkout/Consumer、Checkout幂等。
- 前置依赖：TASK-0202,TASK-0403,TASK-0506。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 取消按钮明确只停止当前付款流程还是服务端意图取消，不承诺外链失效。
    2. 展示退款申请/已外部确认/权益处理/完成的真实投影。
    3. 人工复核给原因、支持编号和禁止重付提示，恢复旧单查询。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0510-NEG`；本地取消后外部paid被丢弃、退款确认冒充到账、拒付显示未付款。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0510-REC`；取消与paid、退款与轮询、二次进入review。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：所有终止/人工状态有下一步。
- 管理员操作验收：用户支持编号可定位订单与决策。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：取消不丢交易，退款与权益状态分开展示。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0511"></a>
### TASK-0511：完成移动端键盘焦点与可访问性

- 目标：键盘全流程可完成，200%缩放和窄屏无关键内容丢失。
- 问题证据：F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F15；Consumer/SDK。
- 前置依赖：TASK-0505,TASK-0506。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`tests/spikes/e2e`、`packages/i18n/src`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`tests/spikes/e2e/t16-r2-account.mjs`、`packages/i18n/src/index.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：本任务不改运行接口；核对并消费前置已冻结合同，不增加第二定义。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 核对实际i18n入口后复用，不存在则只登记现有真实模块路径。
    2. 390px/窄屏和放大检查金额/按钮/状态不裁切，loading/error有可访问名称。
    3. 实现键盘购买、弹窗返回焦点、状态live region及颜色外文本区分。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0511-NEG`；只有鼠标可操作、disabled无解释、重复播报、错误后焦点丢失。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0511-REC`；加载/重试/路由切换过程中焦点稳定。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：移动端备用链接可用，屏幕阅读器区分处理中/成功/失败。
- 管理员操作验收：不影响管理端共享组件回归。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：键盘全流程可完成，200%缩放和窄屏无关键内容丢失。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

<a id="task-0512"></a>
### TASK-0512：封堵用户界面与错误输出敏感信息

- 目标：虚构敏感标记在日志、bundle、缓存、截图中零泄露；不删除必要审计。
- 问题证据：F13：`supabase/functions/_shared/afdian.ts:196,248; supabase/migrations/20260911130910_bill_04_checkout_order_inbox_jobs.sql:512; supabase/functions/billing-webhook/index.ts:235`；F15：`apps/template-preview/app/subscription/page.tsx:110,120,330,347; packages/account-server/src/index.ts:201,613`；F16：`packages/domain/src/redemption.ts:1,13,91,111; docs/architecture/modules/entitlements.md:243; docs/architecture/modules/identity-security.md:101`。原行为/上轮反例见唯一问题表，本轮未重跑业务测试。
- 影响范围：F13,F15,F16；Webhook安全、Consumer/SDK、兑换码。
- 前置依赖：TASK-0502,TASK-0508,TASK-0404。每个前置交付必须核对源码和实际证据，不只检查任务状态文字。
- 变更目录：`apps/template-preview/app/subscription`、`apps/template-preview/app/api/v1/[...path]`、`tests/spikes/e2e`、`supabase/functions/account-api`、`packages/account-server/src`、`packages/domain/src`。
- 变更文件：`apps/template-preview/app/subscription/page.tsx`、`apps/template-preview/app/api/v1/[...path]/route.ts`、`tests/spikes/e2e/t16-r2-account.mjs`、`supabase/functions/account-api/index.ts`、`packages/account-server/src/index.ts`、`packages/domain/src/redemption.ts`。
- 是否涉及数据库迁移：否；发现需迁移时先补本任务依赖/回退/消费者，不能静默扩范围。
- 是否涉及公共合同：是；逐字段同步SQL返回、Edge、OpenAPI、DTO、SDK/BFF及测试，详见影响矩阵。
- 是否涉及 Consumer UI：是，页面及安装/浏览器消费者同步。
- 是否涉及 Admin UI：不直接修改；后续Admin任务消费本任务输出。
- 是否涉及权限或安全边界：是，至少验证已有边界不退化；不增加浏览器直连SQL/Storage、不泄露Secret、不跳过服务端授权或MFA。
- 实施步骤：

    1. 仅允许公开支持编号和用户可见错误码，屏蔽SQL堆栈及Provider个人信息。
    2. 验证BFF no-store、Origin/CSRF/SameSite、安全returnTo与bundle边界。
    3. 兑换明文不写日志、存储、分析事件或自动截图，付款链接不进入埋点。
- 必须保留或新增的失败测试：用例标识建议 `TASK-0512-NEG`；错误响应带SQL/Token/原始订单/兑换码、共享缓存读取前账户数据。已证实缺陷先在旧实现复现FAIL，再记录修复后结果；已有正确防护保留为回归断言，不人为制造失败，不删除旧失败记录。
- 并发/重试/恢复测试：用例标识建议 `TASK-0512-REC`；失败重试/退出/跨账号后旧页面回显。真并发使用至少两连接/两进程；mock不能替代租约接管或事务并发证明。
- 用户体验验收：错误可理解且能恢复，不暴露内部异常。
- 管理员操作验收：管理员仅见授权脱敏证据。
- 验收命令：下列为未来实施验收入口，本轮均未作为业务验证运行；先增加上述具名用例并核对runner覆盖，不能只运行旧套件计通过。环境守卫与类别见第13节。

- `pnpm --filter template-preview typecheck`
- `pnpm test:e2e:t16-r2`
- `pnpm test:registry:m5-04`
- `pnpm test:consumer:m5-05`
- `& 'D:/APP/Codex/Deno/bin/deno.exe' test --allow-env --allow-net --allow-read --allow-import supabase/functions/_shared/afdian.test.ts supabase/functions/billing-webhook/index.test.ts supabase/functions/maintenance/index.test.ts supabase/functions/account-api/index.test.ts`
- `pnpm --filter @kit/domain test:unit`
- `pnpm --filter @kit/account-server test:unit`
- `pnpm docs:check`
- `pnpm contracts:check`
- `git diff --check`

- 预期结果：虚构敏感标记在日志、bundle、缓存、截图中零泄露；不删除必要审计。成功路径和上述负向/恢复断言均需实际证据；上游门槛未过则记BLOCKED。
- 回滚方式：仅回退本任务兼容应用/文档变更；持久操作与审计不回滚，未知外部结果先查单再补偿，不靠创建新订单恢复。
- 完成状态：未开始；实施测试状态NOT_RUN。

## 12. 失败恢复和回滚策略

每TASK可作为独立实施单元；阶段集成需全部门槛。应用可按任务回退，数据迁移只提供兼容停止点和forward-fix，不能承诺财务账本可逆。暂停新购买不删除旧付款链接的后续事实；旧Worker/旧通知必须被fence/幂等隔离。外部操作成功但内部未知时先查询原交易/对象，不能盲重做。环境或策略未明确则BLOCKED，不用宽权限/删测试/吞异常继续。

## 13. 测试矩阵

下表全为计划；每次执行写环境、HEAD、命令、用例ID、退出码、断言、脱敏证据和清理残留。只有PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED五种测试值，范围另列。

| 类别 | 本阶段要求 | 计划结果 |
| --- | --- | --- |
| 静态检查 | docs/contracts/diff；实施后按文件lint/typecheck；不可替代运行验证 | NOT_RUN |
| 单元测试 | 每TASK-NEG/REC；金额、状态、SDK重放和规范化；无代码任务只做计划结构检查 | NOT_RUN |
| SQL/RLS/权限 | 领域结果、关系、owner/search_path和各executor负例；SQL任务不得只断言函数存在 | NOT_RUN |
| API合同测试 | 真实HTTP方法/路径/状态/body/headers/归属；OpenAPI静态通过另记 | NOT_RUN |
| 并发测试 | 按任务用例至少双连接/双会话；断言最终Order/Grant/Job/Audit | NOT_RUN |
| Webhook重放测试 | 同字节/异hash/未签字段及ACK前后故障；非入站任务验证消费者不误读 | NOT_RUN |
| Provider测试 | 模拟合同与真实Provider分别记录；真实调用需环境与授权 | NOT_RUN |
| Consumer E2E | 真实本地BFF→API→DB及UI；模拟Provider明确标注 | NOT_RUN |
| Admin E2E | 权限/MFA/202/If-Match/重放/证据时间线；非UI阶段待集成 | NOT_RUN |
| UI可访问性和响应式 | 窄屏、键盘、焦点、读屏、loading/error；后端阶段保留到UI集成 | NOT_RUN |
| 本地验证 | 只操作已确认localhost隔离fixture；不复用连接staging的既有浏览器会话 | NOT_RUN |
| staging验证 | 需单独授权；支付/租约/权限/网关相关必须实测；纯准备任务只出清单 | NOT_RUN |
| 生产验证 | 另授权部署/真实付款/观察；不得由本地或历史Staging结果替代 | NOT_RUN |

验收命令目录见[矩阵](../repair-matrices.md)。本轮仅执行计划的docs/contracts/diff及结构核对；上述业务命令是未来任务要求。不存在的用例/runner先实现并登记后运行；`pnpm test:api`为占位，不能计通过。

## 14. 验收条件

- [ ] TASK-0501：页面金额/商品/期限与所购snapshot一致。
- [ ] TASK-0502：只恢复本人会话和原意图，401不丢交易记录。
- [ ] TASK-0503：同意图创建一次且失败可继续。
- [ ] TASK-0504：同一意图无重复单；不同意图有明确提示和恢复位置。
- [ ] TASK-0505：不遗留无法控制空白页，不创建新Checkout解决弹窗问题。
- [ ] TASK-0506：每个状态有独立断言和动作；用户文案可反查后端事实。
- [ ] TASK-0507：轮询有界无重叠，后台继续处理，手动恢复仍用原单。
- [ ] TASK-0508：本人原单可恢复，别的账户订单不出现。
- [ ] TASK-0509：UI、Grant区间与当前权益可逐项核对。
- [ ] TASK-0510：取消不丢交易，退款与权益状态分开展示。
- [ ] TASK-0511：键盘全流程可完成，200%缩放和窄屏无关键内容丢失。
- [ ] TASK-0512：虚构敏感标记在日志、bundle、缓存、截图中零泄露；不删除必要审计。
- [ ] 前置未过不标完成；每项结果覆盖成功、失败、并发和恢复，不只HTTP200。
- [ ] 无已知P1在本阶段边界被隐藏；无放宽权限、删除测试或交易数据。
- [ ] SQL/API/SDK/BFF/UI/Registry相关消费者同步，兼容与回退实际验证。

## 15. 交接给下一阶段的输出

每任务提交给下一任务：具体文件diff、迁移实际顺序、合同版本/兼容窗口、前后失败证据、最后权威状态、风险/未验证项、回退停止点。参考[全局任务依赖表](../repair-matrices.md)。本轮禁止提交与推送；后续是否提交按届时用户授权，不能从历史附录继承。

## 16. 未完成事项和 NOT_RUN 项

全部TASK尚未实施；所需真实Provider合同、D1/D2/D3、告警责任/阈值、外部备份目标、staging/生产授权按任务标注。文档静态通过不把本阶段标验收通过。修复后才将实际事实同步architecture/reference/guides，本轮只整理proposal。

历史阶段保留在[归档文件](../../../archive/subscription-billing-centralization/phases/06-consumer-sdk-and-reference-template.md)；只作来源，状态和派发规则不作为本次修复验收。
