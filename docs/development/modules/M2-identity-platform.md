# M2 身份、平台与账户实施规格

状态：IN_PROGRESS；已有SQL/部分SDK/HTTP及密码登录链路，T12/T16仍PARTIAL。依赖M1公共设施、SP-AUTH/SP-SQL结论；剩余任务见[DP2收尾](../tasks/closeout-01.md)。依据[安全](../../auth-security.md)、[API](../../api-sdk.md)、[公共合同](../contracts.md)。

## 1. 范围与纵向链路

交付Auth core、Next.js adapter、最小Server SDK、Account HTTP adapter、平台Key与Principal、激活/状态/资料、公开套餐读取和最小Admin管理。公开套餐读取用M1的Plan表与fixture；Plan完整CRUD归M3。

目标链路：Consumer登录→BFF验证→Platform Key+用户JWT→Account API→私有SQL→Profile；Admin暂停账户后下次业务请求拒绝。

不做权益算法、文件内容传输、完整Registry发布或自动Global Purge。Global Delete仅接收经近期认证的请求，必须明确显示pending_admin，不伪报清除完成。

## 2. HTTP和认证

M2先生成Account/Admin OpenAPI、共享DTO和错误码测试，后实现路由。实现plans、principal、activate、close、profile/preferences、identity/delete-request；未交付的M3/M4路径不能返回假成功。

中央入口逐路由验证Key/JWT，默认拒绝未知方法和路径；公开plans只省略用户token，仍要求平台Key及active平台。principal可诊断账户/平台非active，但Key失效、Admin身份及deleting仍拒绝。

JWT验证限定issuer/audience/算法/exp等；Provider没有nbf时按官方可选claim处理，不自造必填claim拒绝合法token。session helper确认user/session对应和门闩，失败503。user_metadata和body归属不能参与授权。

BFF使用每请求server client，检查Origin/CSRF、相对returnTo、Cookie和缓存策略；先区分Supabase Auth用户已存在与Platform Account已激活，不在GET隐式创建账户。

## 3. 用户与管理员认证

email/password、Google OAuth、确认/重置邮件、linkIdentity由account-auth统一意图接口与官方adapter实现。session刷新不改变业务状态，local logout不撤销其他独立会话。真实Google/SMTP测试属于G2-S，不由mock替代。

普通用户Close/Link敏感完成/删除请求的近期认证协议必须依据SP-AUTH的ADR：服务器验证同user、目标session、认证事件与短期有效性；原session已撤销则证明失效。没有可靠证据的路径返回明确不可用且不能达到G2验收，禁止只比较JWT iat。

Admin验证membership、session、AAL2，敏感动作还要求5分钟step_up；请求freshness在服务器和DB包装再次核对。Admin不允许activate普通Platform Account。Admin shell和敏感动作服务端骨架在本模块交付，M5不是首次做管理员鉴权。

## 4. 账户、Profile与状态

activate在身份/平台检查下查existing；active返回既有，suspended/closed返回业务错误；新建需要allow_activation。使用unique(platform,user)，竞争后重新读取并判断。Profile/Preferences及必要初始状态同事务，Free不写Grant。

Profile PATCH白名单，Preferences MergePatch；If-Match转expected row_version，在同一UPDATE条件中递增，0行即412。两个版本相同并发写只有一个成功，响应带新ETag。请求及合并后数据<=64KiB；用户不可更新账户归属。

Admin平台更新/Key撤销先锁platform；敏感账户变更获取相同账户锁并审计。Suspend不触发清理，Close记录closed_at供后续M4任务使用；closed不提供restore动作。停用不追溯取消已开始跨系统动作，新授权默认拒绝。

Global Delete请求创建与真正deleting分开：用户请求只pending_admin；M4 Admin确认启动后设门闩。请求撤回仅在未批准时允许，由Admin受控处理，不凭旧token解除已开始清除。

## 5. 平台配置与Key

Key生成使用CSPRNG32随机字节，格式含keyId/version；后端只持久HMAC和mask，清晰区分平台Key与Supabase Key。首次明文响应no-store，生成响应丢失通过新操作创建新Key并撤销未知交付Key，不恢复明文。

生成Key与creation_operation_id关联；创建响应丢失时，用原operation_id查询keyId元数据，撤销该未知交付Key后以新操作生成，不能重复返回明文。Key存在不代表BFF已完成部署；轮换保留旧Key直到新Key成功调用被确认，再显式revoke。不额外引入未经架构定义的Key交付倒计时或自动撤销规则。

Origin注册规范化、同源回调、环境隔离和唯一性。同步器与普通账户runtime分离，不把Management API全权Secret发给每个BFF。未同步的Origin不能作为成功Auth配置；Admin显示synced/drift/error状态。

## 6. 失败与验收

Auth异常不返回SQL/Provider原文；故障503不降级仅JWT；Key错误401；跨目标资源404。客户端会话刷新、网络重试与业务幂等分别处理；不自动重试所有POST。

G2-L须通过V-AUTH-01/02/03、V-ACCOUNT-01～05及V-SDK-01/02的已交付方法；G2-S再通过V-AUTH-04的真实Provider及托管探针。Close/近期认证子用例尚未验证时模块只能部分完成。

交付DTO/OpenAPI、HTTP/SQL流程、三个SDK最小包、Admin基础动作、Consumer纵向测试、无Secret浏览器构建证明及当前未通过的托管依赖清单。
