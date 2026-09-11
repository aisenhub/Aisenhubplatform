# 跨模块合同与所有权

本文件描述当前代码、数据库函数、共享类型、API、SDK、Admin 和 Maintenance 之间的所有权与调用边界。详细接口字段见 [API](api.md) 和 [OpenAPI 合同](contracts/account.openapi.json)。

## 1. 目录和唯一维护方

| 目录/产物 | 维护模块 | 限制 |
|---|---|---|
| packages/domain/src/contracts | Domain | DTO、错误和校验，不引入React/Next或生产权益计算 |
| packages/account-auth | Auth | 框架无关Auth adapter接口，不含平台Key |
| packages/account-auth-nextjs | Auth/Web | SSR/Cookie/回调与同源BFF胶水，不能直写业务表 |
| packages/account-server | Account/Entitlements | server-only，遵守HTTP合同与预算 |
| supabase/functions/account-api | Account/Auth/Entitlements/Files | HTTP路由/认证，不持有另一套业务算法 |
| supabase/functions/maintenance | Files/Operations | job鉴权、租约与任务分派，不开放用户入口 |
| supabase/functions/_shared | Platform | 通用日志、SQL、时钟、错误、受控Storage adapter |
| supabase/migrations | 每模块添加，集成人串行排定顺序 | 不多人改同一已提交migration |
| contracts/account.openapi.json | Account | 用户/平台API，字段和状态码与实际路由同步 |
| contracts/admin.openapi.json | Admin | 管理API，按模块扩展但不生成任意CRUD代理 |
| registry、apps/template-preview | Consumers | UI复制，业务规则不复制 |

packages/domain 使用纯 TypeScript 和显式相对 ESM 导入供 Edge 使用；不依赖 Node 专属 API、路径别名或未发布 workspace 解析。Node 与 Edge 的导入兼容性必须通过实际探针或构建检查确认；若固定工具链不支持，由 ADR 选择可重现构建产物映射，不复制源文件来规避。

## 2. 可信上下文

SQL定义private.account_context(user_id,session_id,platform_id,platform_key_id,request_id)，字段UUID非空语义由函数校验；platform_account_id在数据库根据user/platform解析，不由HTTP提交。激活前允许不存在账户，但不能伪造目标账户。

Admin函数使用private.admin_context(admin_user_id,session_id,request_id)，目标platform/account作为单独参数，包装函数验证singleton/session/step-up。Job函数用private.job_context(job_id,lease_owner,fencing_token,request_id)。

这些context仅在受控服务内部构造。数据库不信任额外is_admin/aal布尔值；已验证HTTP身份由对应executor调用，数据库再检查可持久验证的会话/成员/证明和关系。失陷executor属于运行时信任边界，不能声称类型本身防止服务被攻陷。

## 3. SQL函数注册表

下表是当前迁移和函数源码中的领域入口及语义，不要求使用任意 JSON 字符串承载未校验参数。具体参数类型以对应迁移签名为准；函数只能通过被授予的 executor 调用。

| 入口 | 模块/调用方 | 输入、结果与事务职责 |
|---|---|---|
| private.check_user_session | Auth helper | user/session → active/reason；只读最小Auth列 |
| private.account_principal | Account | ctx → Principal；删除任务门闩优先于lazy identity row创建 |
| private.account_activate | Account | ctx → 唯一账户及状态；资料/偏好/审计同事务 |
| private.account_close | Account | ctx+近期证明引用 → closed；不执行Auth删除 |
| private.profile_get / profile_patch | Account | ctx+白名单patch+expected_version → DTO/412 |
| private.preferences_get / preferences_patch | Account | ctx+MergePatch+expected_version → DTO/412 |
| private.public_plans_list | Account | 已验证platform key context → 公开active字段 |
| private.admin_platform_update | Admin | Admin ctx+目标+patch → 平台；platform UPDATE锁 |
| private.admin_account_transition | Admin | Admin ctx+目标+action+reason → suspend/restore/close |
| private.admin_platform_key_create / admin_platform_key_confirm_deployment / admin_platform_key_revoke | Admin | Admin ctx+hash/version等 → key metadata；明文不入库；撤旧前必须持久确认新Key已部署 |
| private.entitlement_read | Entitlements/Account | ctx → 标准权益；边界同步重算 |
| private.entitlement_apply | Entitlements 内部 | 已授权操作+source/operationId → Grant/Event/Projection；不授予executor直接调用 |
| private.redeem_subscription_code | Entitlements/Account | ctx+规范化码HMAC+版本+idem → 原子结果 |
| private.admin_entitlement_command | Entitlements/Admin | Admin ctx+目标+grant/revoke/pause/resume/correct+operation_id → 统一领域结果 |
| private.admin_plan_upsert | Entitlements/Admin | Admin ctx+平台+计划字段+默认Free动作 → 计划生命周期与默认计划原子更新 |
| private.platform_key_verify_presented | Account | key id+HMAC+版本 → active platform/key metadata；只授予account_executor，不开放Key表读取 |
| private.admin_plan_list / admin_batch_list / admin_subscription_read | Entitlements/Admin | Admin ctx+目标范围 → 只读计划、兑换批次、订阅投影；不授予基础表读取 |
| private.admin_step_up_valid | Admin | user+session+proof → 5分钟内有效性；敏感写操作必须通过统一包装 |
| private.admin_batch_create / confirm / disable | Entitlements/Admin | 生成的hash列表/receipt hash与状态，禁止接收明文持久字段 |
| private.file_intent_create | Files/Account | ctx+metadata+size+replaceId+idem → file_id/预约 |
| private.file_receive_claim / file_prepare_store / file_write_attempt_mark_unknown / file_write_attempt_finalize | Files | ctx+fileId+fence+大小/hash/结果 → 状态；各短事务 |
| private.file_delete_request | Files/Account/Admin包装 | 已授权context+fileId → deleting，不提前释放预算 |
| private.job_lease_claim / job_lease_release | Operations | 租约与 fencing token 原子检查，不调用Storage |
| private.file_cleanup_candidates / file_cleanup_claim / file_cleanup_finish / file_reconcile_step | Files/Operations | 固定候选、租约、Storage结果结算和对账；不接受任意表名或SQL |
| private.identity_delete_request | Account | ctx+近期证明 → pending_admin请求；不自动开始删除任务 |
| private.admin_deletion_job_start / admin_deletion_job_retry | Admin | Admin ctx+request/proof/idem → 可恢复删除任务；不直接删除Auth或Storage |
| private.deletion_job_claim / deletion_job_step | Operations | job context+lease fence+固定checkpoint → 顺序推进、重试或阻塞 |
| private.deletion_job_file_list / deletion_job_auth_target / deletion_job_auth_prepare | Operations | 固定删除任务的文件和Auth目标；不暴露任意表删除 |
| private.file_backup_barrier_begin / file_backup_barrier_finish | Operations/Recovery | 持久化恢复屏障和manifest结果；不把部分备份标记为成功 |

审计写入、幂等claim/finalize、quota核算、entitlement_apply为内部帮助函数，不单独授予account_executor以避免调用方拆散事务。HTTP layer的一次逻辑操作对应一个领域入口；文件跨Storage部分例外为明确状态机步骤。

## 4. 共享结果与序列化

DomainResult<T>为成功data或确定性业务拒绝code/status，不把业务拒绝全部raise成事务异常；SQL基础设施异常向外回滚。HTTP adapter统一生成request_id外壳与脱敏错误。request_id不是幂等key。

Admin Grant必须有operation_id UUID和reason；兑换operation_id来自code.id；source+operation_id永久唯一。重放先重新鉴权。Profiles/Preferences增加row_version bigint（初始1、每次成功patch+1），ETag为服务端生成的不透明版本表示，客户端仅If-Match回传；updated_at仍用于展示。

OpenAPI必须覆盖API专题当前全部21个Account方法/路径组合、body/header约束、每条鉴权要求、状态码、分页、no-store及二进制响应。结账创建/读取必须同步声明服务端定价、幂等、跨账户404和CHECKOUT_UNAVAILABLE；尚未实现路由不应暴露成功假数据。

Admin路径固定为/admin/api/v1，具体动作：

- platforms：创建/列表/读取/更新；子资源origins、keys（创建、部署确认、撤销）、file-policy。
- platform-accounts：列表/读取，动作suspend、restore、close。
- plans：创建/更新/归档，默认Free通过platform更新。
- redemption-batches：创建、读取、confirm-delivery、disable；codes只读mask和按码disable。
- subscriptions：读取与commands，拒绝直接PATCH Projection。
- config-files：metadata、受控download、delete。
- audit：只读筛选分页；deletion-jobs：只读状态、Admin start/retry；不提供任意checkpoint编辑。

Admin列表按平台/目标资源过滤；平台、Origin、Key、账户和文件列表支持可选 `q`（最多128字符）以及既有 `limit`/cursor 参数，过滤在受控 SQL wrapper 内执行。文件列表另支持可选精确 `platform_id`，必须在服务端分页前过滤，scoped cursor 跨平台返回400，未知平台返回404；不带该参数保持全局兼容语义。所有敏感动作使用同一授权包装和Audit。读列表也须Admin身份，不能因不修改数据跳过鉴权。

## 5. OpenAPI 与 DTO 合同

Account与Admin的OpenAPI 3.1合同维护在`contracts/account.openapi.json`和`contracts/admin.openapi.json`。Account合同当前包含21个方法/路径组合，并包含无 Bearer 的平台 Key 商品目录读取；结账接口需要Bearer与Platform Key且响应no-store；Admin合同覆盖平台、账户动作、Key、Plan、兑换批次、Subscription、文件、审计和删除任务资源。所有未实现的操作不得暴露成功假数据。

共享DTO、稳定大写错误码和三类SQL context映射位于`packages/domain/src/contracts/api.ts`。`contracts:check`校验引用、operationId、鉴权、错误枚举、none权益的NULL语义、原始二进制上传/下载和`Cache-Control: no-store`。普通用户Close与Global Delete的近期认证必须使用服务端 session-bound proof；OpenAPI 的存在不代表路由、Provider 或真实会话生命周期已经完成。

BILL-01 的 Provider-neutral 计费草案位于`packages/domain/src/contracts/billing.ts`，冻结四种商品的期限语义、定点金额字符串、不可变 Checkout snapshot、Provider 订单观察、操作来源/版本和结算状态。该文件不创建支付表、不实现权益写入、不证明 Afdian 已联调；真实 Provider 适配器必须在后续阶段以授权的协议证据为准。

## 6. 时间、事务和失败边界

Postgres生成operation_now；生产函数不得接受用户自定当前时间。测试时钟只在隔离测试入口使用，不授予生产executor。重放用例的as_of是只读/测试能力，不开放给用户改变授权时刻。

锁顺序遵守订阅专题；文件在身份/平台/Key检查后先锁账户再按ID锁文件，策略变更先锁平台。跨网络不得持有DB事务。拿不到锁返回可识别暂时错误，而不是忽略冲突。

Storage提供putImmutable/getInfo/download/remove四种受控adapter操作；收到网络超时返回unknown，不将404推断成没有未结算写入。受控内容不能进日志，id/hash与请求摘要才可用。

## 7. 合同变更规则

- OpenAPI 文件、`packages/domain/src/contracts`、实际路由 schema、数据库迁移和消费者必须一起核对；只改其中一份不算完成。
- 新增或修改公共字段、稳定错误码、状态枚举、鉴权要求、分页游标、幂等语义或 SQL 入口时，先更新本文件及必要的架构决策，再同步所有消费者和测试。
- 以当前代码、已应用迁移和实际命令输出作为实现证据。文档中尚未被代码或验证记录支持的内容必须标为待实现或待验证。
- 使用 `pnpm contracts:check` 检查 OpenAPI 引用、`operationId`、鉴权、错误枚举、二进制响应和缓存约束；检查通过不等于每个业务操作都已在真实环境完成。
- 任何会改变数据保留、权限边界、身份生命周期或恢复语义的合同变更，都要同步 `docs/architecture/`、`docs/decisions/` 和对应验证记录。
