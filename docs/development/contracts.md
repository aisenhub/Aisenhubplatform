# 跨模块合同与所有权 DP1

从属于[架构基线](../architecture.md)和[API合同](../api-sdk.md)。本文固定实施边界；已有M1/M2/M3实现按任务证据判定，条目存在不代表全部入口已交付。未经变更记录不能随意重命名。

## 1. 目录和唯一维护方

| 目录/产物 | 维护模块 | 限制 |
|---|---|---|
| packages/domain/src/contracts | M1/M2 | DTO、错误和校验，不引入React/Next或生产权益计算 |
| packages/account-auth | M2 | 框架无关Auth adapter接口，不含平台Key |
| packages/account-auth-nextjs | M2/M5 | SSR/Cookie/回调与同源BFF胶水，不能直写业务表 |
| packages/account-server | M2起按领域扩展，M5发布 | server-only，遵守HTTP合同与预算 |
| supabase/functions/account-api | M2/M3/M4 | HTTP路由/认证，不持有另一套业务算法；已有Local与Staging基础路径，完整资源/浏览器/托管验收仍分别收口 |
| supabase/functions/maintenance | M4/M6 | job鉴权、租约与任务分派，不开放用户入口 |
| supabase/functions/_shared | M0/M1 | 通用日志、SQL、时钟、错误、受控Storage adapter |
| supabase/migrations | 每模块添加，集成人串行排定顺序 | 不多人改同一已提交migration |
| docs/contracts/account.openapi.json | M2 | 用户/平台API；M3/M4追加对应资源 |
| docs/contracts/admin.openapi.json | M2起按模块扩展 | 不生成任意CRUD代理 |
| registry、apps/template-preview | M5，M2建立最小消费者 | UI复制，业务规则不复制 |

packages/domain纯TS源码通过显式相对ESM导入供Edge使用；不依赖Node专属API、路径别名或未发布workspace解析。M0做Node/Edge双运行时import探针；若固定工具链不支持，由ADR选择可重现构建产物映射，不复制源文件来规避。

## 2. 可信上下文

SQL定义private.account_context(user_id,session_id,platform_id,platform_key_id,request_id)，字段UUID非空语义由函数校验；platform_account_id在数据库根据user/platform解析，不由HTTP提交。激活前允许不存在账户，但不能伪造目标账户。

Admin函数使用private.admin_context(admin_user_id,session_id,request_id)，目标platform/account作为单独参数，包装函数验证singleton/session/step-up。Job函数用private.job_context(job_id,lease_owner,fencing_token,request_id)。

这些context仅在受控服务内部构造。数据库不信任额外is_admin/aal布尔值；已验证HTTP身份由对应executor调用，数据库再检查可持久验证的会话/成员/证明和关系。失陷executor属于运行时信任边界，不能声称类型本身防止服务被攻陷。

## 3. SQL函数注册表

下表是领域入口名字及语义，不要求使用任意JSON字符串承载未校验参数。具体SQL参数类型按M1/M2合同任务固定；函数只能通过被授予的executor调用。

| 入口 | 模块/调用方 | 输入、结果与事务职责 |
|---|---|---|
| private.check_user_session | M1/auth helper | user/session → active/reason；只读最小Auth列 |
| private.account_principal | M2/account | ctx → Principal；deletion job门闩优先于lazy identity row创建 |
| private.account_activate | M2/account | ctx → 唯一账户及状态；资料/偏好/审计同事务 |
| private.account_close | M2/account | ctx+近期证明引用 → closed；不执行Auth删除 |
| private.profile_get / profile_patch | M2/account | ctx+白名单patch+expected_version → DTO/412 |
| private.preferences_get / preferences_patch | M2/account | ctx+MergePatch+expected_version → DTO/412 |
| private.public_plans_list | M2/account | 已验证platform key context → 公开active字段 |
| private.admin_platform_update | M2/admin | Admin ctx+目标+patch → 平台；platform UPDATE锁 |
| private.admin_account_transition | M2/admin | Admin ctx+目标+action+reason → suspend/restore/close |
| private.admin_key_create / admin_key_confirm_deployment / admin_key_revoke | M2/admin | Admin ctx+hash/version等 → key metadata；明文不入库；撤旧前必须持久确认新Key已部署 |
| private.entitlement_read | M3/account | ctx → 标准权益；边界同步重算 |
| private.entitlement_apply | M3/domain内部 | 已授权操作+source/operationId → Grant/Event/Projection；不授予executor直接调用 |
| private.redeem_subscription_code | M3/account | ctx+规范化码HMAC+版本+idem → 原子结果 |
| private.admin_entitlement_command | M3/admin | Admin ctx+目标+grant/revoke/pause/resume/correct+operation_id → 统一领域结果 |
| private.admin_plan_upsert | M3/admin | Admin ctx+平台+计划字段+默认Free动作 → 计划生命周期与默认计划原子更新 |
| private.platform_key_verify_presented | M3/account | key id+HMAC+版本 → active platform/key metadata；只授予account_executor，不开放Key表读取 |
| private.admin_plan_list / admin_batch_list / admin_subscription_read | M3/admin | Admin ctx+目标范围 → 只读计划、兑换批次、订阅投影；不授予基础表读取 |
| private.admin_step_up_valid | M3/admin | user+session+proof → 5分钟内有效性；敏感写操作必须通过统一包装 |
| private.admin_batch_create / confirm / disable | M3/admin | 生成的hash列表/receipt hash与状态，禁止接收明文持久字段 |
| private.file_intent_create | M4/account | ctx+metadata+size+replaceId+idem → file_id/预约 |
| private.file_receive_claim / prepare_store / finalize | M4/account | ctx+fileId+fence+大小/hash/结果 → 状态；各短事务 |
| private.file_delete_request | M4/account/admin包装 | 已授权context+fileId → deleting，不提前释放预算 |
| private.job_claim / checkpoint / finish | M1基础、M4使用/job | 租约与fence原子检查，不调用Storage |
| private.identity_delete_request | M2/account | ctx+近期证明 → pending_admin请求；不自动开始purge |
| private.admin_identity_delete_start | M4/admin | Admin ctx+requestId → identity gate+job |
| private.identity_purge_checkpoint | M4/recovery或受限job包装 | job/fence+阶段结果 → 可恢复清除；不暴露任意表删除 |

审计写入、幂等claim/finalize、quota核算、entitlement_apply为内部帮助函数，不单独授予account_executor以避免调用方拆散事务。HTTP layer的一次逻辑操作对应一个领域入口；文件跨Storage部分例外为明确状态机步骤。

## 4. 共享结果与序列化

DomainResult<T>为成功data或确定性业务拒绝code/status，不把业务拒绝全部raise成事务异常；SQL基础设施异常向外回滚。HTTP adapter统一生成request_id外壳与脱敏错误。request_id不是幂等key。

Admin Grant必须有operation_id UUID和reason；兑换operation_id来自code.id；source+operation_id永久唯一。重放先重新鉴权。Profiles/Preferences增加row_version bigint（初始1、每次成功patch+1），ETag为服务端生成的不透明版本表示，客户端仅If-Match回传；updated_at仍用于展示。

OpenAPI必须覆盖API专题当前全部17个Account方法/路径组合、body/header约束、每条鉴权要求、状态码、分页、no-store及二进制响应。新增经过验证的reauth路径后同步更新清单和数量，实际条目由API表抽取核对。尚未实现路由不应暴露成功假数据。

Admin路径固定为/admin/api/v1，具体动作：

- platforms：创建/列表/读取/更新；子资源origins、keys（创建、部署确认、撤销）、file-policy。
- platform-accounts：列表/读取，动作suspend、restore、close。
- plans：创建/更新/归档，默认Free通过platform更新。
- redemption-batches：创建、读取、confirm-delivery、disable；codes只读mask和按码disable。
- subscriptions：读取与commands，拒绝直接PATCH Projection。
- config-files：metadata、受控download、delete。
- audit：只读筛选分页；deletion-jobs：只读状态、Admin start/retry；不提供任意checkpoint编辑。

Admin列表按平台/目标资源过滤；平台、Origin、Key、账户和文件列表支持可选 `q`（最多128字符）以及既有 `limit`/cursor 参数，过滤在受控 SQL wrapper 内执行。文件列表另支持可选精确 `platform_id`，必须在服务端分页前过滤，scoped cursor 跨平台返回400，未知平台返回404；不带该参数保持全局兼容语义。所有敏感动作使用同一授权包装和Audit。读列表也须Admin身份，不能因不修改数据跳过鉴权。

## 5. T11冻结产物

T11将Account与Admin的OpenAPI 3.1合同冻结在`docs/contracts/account.openapi.json`和`docs/contracts/admin.openapi.json`。Account合同固定17个方法/路径组合；Admin合同覆盖平台、账户动作、Key、Plan、兑换批次、Subscription、文件、审计和删除任务资源。所有尚未实现的操作显式标为`contract-only`，不得返回假成功。

共享DTO、稳定大写错误码和三类SQL context映射位于`packages/domain/src/contracts/api.ts`。`contracts:check`校验引用、operationId、鉴权、错误枚举、none权益的NULL语义、原始二进制上传/下载和`Cache-Control: no-store`。普通用户Close与Global Delete的近期认证仍依赖T04服务端session-bound proof，未以合同冻结替代实现。

## 6. 时间、事务和失败边界

Postgres生成operation_now；生产函数不得接受用户自定当前时间。测试时钟只在隔离测试入口使用，不授予生产executor。重放用例的as_of是只读/测试能力，不开放给用户改变授权时刻。

锁顺序遵守订阅专题；文件在身份/平台/Key检查后先锁账户再按ID锁文件，策略变更先锁平台。跨网络不得持有DB事务。拿不到锁返回可识别暂时错误，而不是忽略冲突。

Storage提供putImmutable/getInfo/download/remove四种受控adapter操作；收到网络超时返回unknown，不将404推断成没有未结算写入。受控内容不能进日志，id/hash与请求摘要才可用。

## 7. 适配验证与DP2差异登记

T04已交付Local管理员MFA/proof和logout旧JWT拒绝，T17记录Staging基础Auth/API；这不覆盖普通用户“近期重新认证”、真实SSR和Provider。T12-R1/R2补普通proof、local/global退出范围及回调；不得以JWT iat或前端布尔值代替。Close/Link敏感完成步骤/Global Delete请求不能以弱校验上线。

当前OpenAPI为18个Account、36个Admin操作，Admin已包含recent-proof；不能把数量/结构检查PASS称为所有操作已实现或真实proof生命周期通过。T12-R2须核对API专题、OpenAPI、DTO/消费者的普通reauth及Admin proof语义，新增reauth endpoint先登记合同再实现，不重复新增已有Admin路由。

SP-SQL确认Auth表实际可授予列与pooler角色形式；SP-UPLOAD确认真实host取消语义。发现必须改变上述合同的情况按决策登记处理，不由agent自行选择安全降级。

T17-R1核对Staging `verify_jwt=true`与安全专题网关配置要求的差异，以及默认数据库连接尚未证明独立executor/TLS的问题。当前仅登记未闭环差异，不认可另一套权限规则；任何合同变更先有ADR及消费者/验收同步。

M4-01负责补齐文件SQL参数/结果、file-policy/查询/恢复包装及备份屏障/删除墓碑合同，沿用当前字段与6个Account文件操作；M4-02持久化最小屏障基础，M4-05消费它阻止物理删除，M6实现联合备份及独立墓碑保存。复用已存在的private.job_leases，不能新增同名公共任务设施。unknown是write_outcome，不作为新增status枚举。

## 8. ASU-R1 Auth 变更登记（已实施，环境验证仍分层）

2026-09-09 审查确认：现有共享 Cookie TTL、local logout scope、迟到响应与隐式 setSession 刷新不满足新体验目标。新执行合同唯一维护于 [Auth master §2.10](../plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/00-master-plan.md)：scoped CSRF/proof、30 天 CSRF、local revoke 分类、有界退出、scoped HttpOnly fence/ack、epoch/generation、独立 stepUp、MFA 部分成功及安装产物验收。

这些变更已由 ASU-01～05 同步至 shared packages、两 BFF/全部 Cookie 消费者、callback、UI 与测试。旧共享 CSRF/proof 不做跨 scope 复制，已有浏览器允许一次重新登录。fence/ack 只增加本地退出拒绝条件，不替代中央实时授权、不确认 Provider 撤销，不新增 SQL 领域写入口。OpenAPI 仅在中央 HTTP/DTO 实际变更时同步，BFF Auth 合同不能误记成新增中央 API。真实 Supabase/Auth、浏览器双 Tab、响应式与生产观察状态以 verification record 为准。

Phase 01 更新 auth-security/API 专题的实际最终合同，Phase 05 提供实现 SHA 与完整消费者证据。本轮仅登记批准的设计方向，不把后续实现测试写成 PASS。

## 9. FE-R1 前端必要依赖登记（合同仍有效；实现状态分层记录）

前端修订合同见 [FE-R1](../plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/references/fe-r1-execution-contracts.md)。FE-D01已在现有Admin文件列表补可选精确platform_id：通过新增受控 scoped SQL wrapper、handler 参数校验、OpenAPI 与权限/分页测试实现；不更改Account租户推导或配额算法。FE-D02核验批次重复创建的明文/receipt语义，未闭环前禁止通过重发创建恢复明文。FE-D03补共享UI独立分发与安装验收，不等于授权公开发布。FE-D01代码已实现并完成本地两平台返回范围核对，Phase 05 代码批次已 push 并合并 `main`；Hosted/完整阶段关闭仍以 FE-R1 verification record 的实际证据为准。

默认简体中文仅改变展示，DTO/稳定错误码/枚举/Header/幂等key与时间传输合同保持原值；中文说明见 [中文UI合同](../plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/references/chinese-ui-contract.md)。
