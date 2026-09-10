# FE-R1 执行合同与能力校准

修订日期：2026-09-10；当前代码基线：`main@94631ff`（FE-D02 批次边界基线为 `54ff797`，文档维护提交另行记录）。以下是 FE-R1 执行合同与能力边界；Phase 01～08 与 FE-D02 已有本地代码批次和验证记录，但合同级剩余项仍未全部关闭。与旧研究快照描述冲突时，本修订用于执行；公共安全/业务合同仍以上层架构和专题为准。

## 1. 已知 API 能力与依赖

证据：`supabase/functions/account-api/index.ts` 的 admin handler、`docs/contracts/admin.openapi.json`；SQL 包括 `20260908221107_admin_resource_search.sql`、`20260907145157_m3_api_reads.sql`。实施前复核是否漂移，不能只检查 OpenAPI 数量。

| 资源 | 当前代码能力 | 本期决定 |
|---|---|---|
| 平台 | q/limit，无实现 cursor | 有界搜索/列表，暂不提供下一页或状态全量筛选 |
| 平台账户 | 平台路径、q/limit | 平台列表与详情入口；未实现参数不得伪装分页 |
| 套餐 | 平台范围列表、真实写入口 | 只提供已实现筛选与编辑字段 |
| 订阅 | 单账户读取和 command，无列表 | Accounts → 订阅详情，URL account 参数；不新增订阅列表 |
| 兑换批次 | platform_id/limit，无 cursor，列表不返回 creation_operation_id | 有界列表；创建未知结果不能按名称猜原 operation |
| 文件 | 全局 q/limit/cursor；Admin 列表另支持可选精确 platform_id，SQL q 不搜索平台 ID | 平台 Files 使用服务端范围过滤与 cursor；不允许全局一页客户端过滤冒充平台数据集 |
| 审计 | q/limit/cursor，无独立 exact target filter | 基础搜索与详情，不提供精确资源时间线 |
| 删除任务 | limit 有界列表 | Operations 第一版主来源；显示查询范围，不能当全局完整计数 |

### FE-D01：平台文件查询最小合同补齐（Phase 05 开始前）

- Owner：集成人/受控 API 维护方；依赖 Phase 02 平台路由合同，可独立于 Phase 04 准备。当前状态 IMPLEMENTED_LOCAL；FE-V05/Phase05 的本地 scoped 返回、跨平台 cursor 和权限边界已记录，代码批次已 push 并合并 `main`，Hosted/全阶段关闭仍按 verification record 维护。
- 在现有 Admin 文件列表增加可选精确 `platform_id`（合法 UUID；无参数保留全局语义）。精确平台过滤必须在排序/分页前执行；未知平台、无效参数、跨平台 cursor 的拒绝语义先登记 OpenAPI/合同和测试，再实现。
- 新 scoped 列表只返回目标平台；cursor 必须属于相同平台范围。详情/动作仍由服务端授权，前端打开详情时核对返回 platform_id 与 URL，不能在 B 平台标题下操作 A 的文件。
- 允许目录：`docs/contracts/admin.openapi.json`、公共合同、相关 DTO（如确有改动）、Account API handler、CLI 生成的新 migration、权限/分页/API 测试和消费者。不得修改已应用迁移，不新增配额/授权算法。执行 Supabase 工作时仍须加载技能、核对固定版本与官方资料。
- 测试：两平台文件交错且跨多页、空平台、invalid/unknown ID、跨平台 cursor、原 global 查询兼容、匿名/非管理员拒绝。FE-V05；当前已完成本地 scoped 返回、跨平台 cursor、无效 UUID、global handler compatibility 与 Admin 权限边界核对。
- 未通过时 Phase 05 平台文件列表 BLOCKED；可完成策略/设置等独立准备，不能宣称整阶段通过。不得为绕过依赖无限拉全局文件。

## 2. Auth 接入与布局

- ASU-01～05 已实施；上游真实环境证据见 Auth verification record，不把历史 NOT_RUN 或 Local PASS扩展为生产结论。复用 `packages/account-auth/src/index.ts`、`packages/account-auth-nextjs/src/browser-session.ts` 和两个 App 的 `app/_lib/auth-session.ts`。
- SessionSnapshot 包含 state、resolved、stepUp；stepUp 区分 admin_mfa/admin_recent_mfa/consumer_recent_auth。保留 scoped CSRF/proof、HttpOnly fence/ack、终态广播、epoch 防迟到响应合同。
- Error Presenter 消费 HTTP envelope 与 SessionRetryRequiredError、SessionExpiredError、AuthorizationUnavailableError、SessionReplayPolicyError；会话恢复不等于 mutation 已重放。不另造 fetch/refresh/CSRF transport。
- Phase 01 将 `/admin/login`、`/admin/mfa` 与受保护页面分开布局（可采用不改变 URL 的 route group）。登录与初次 AAL2 验证不依赖受保护列表请求；recent MFA 不卸载整个已登录工作区。
- Phase 03 抽取现有 MFA 表单，使其既可供原路由使用，也可在当前 mutation surface 内完成；继续调用原 BFF。敏感流程采用同页验证，避免当前 MFA 成功 `window.location.assign('/admin')` 丢失 receipt/intent。不新增 tokenized continuation、OTP 重放或第二套 MFA 协议。
- 非敏感 return-to 如确有必要只接受经过验证的站内路径，不携带明文/receipt/OTP；验证完成仍按 replay 合同显式提交。

## 3. RemoteData 与请求身份

五态是展示语义，不强制以一个互斥 union 承载全部数据。实现必须独立表达 data、initial status、refreshing、refreshError、emptyKind、request identity；已有数据+刷新失败仍保留同上下文数据与警告。

请求身份至少包含 Auth scope、session epoch、platformId、resourceId、规范化 query。使用每资源 request generation 或等效机制阻止同会话乱序响应；AbortController 仅优化取消，不作为唯一正确性保障。Auth epoch 校验在异步解析完成和写 state 前执行。

只有同一请求上下文可保留 last-known data。平台/账户/会话变化清理旧数据、drawer、selection、draft 和安全 intent；若有未完成写入，先提示并保留非敏感恢复线索，不能把旧 intent套到新平台。退出/过期立即清明文、receipt、缓存，迟到响应不得恢复。筛选/平台变化重置 cursor，不沿用另一数据集的 cursor。FE-V02～03。

## 4. Mutation intent 与恢复矩阵

Intent 以 scope/platform/target/kind 定位；首次实际提交前允许编辑 payload，提交后同一逻辑重试冻结 payload 和业务 key。pending/accepted/unknown 关闭 Dialog不等于取消服务端任务；重开同操作必须找回原安全 intent，不能另发新 key。终态后新显式业务动作才生成新 key。不跨会话保留凭据或秘密。

| 操作 | 关联与恢复规则 | 禁止推断 |
|---|---|---|
| 账户状态 | GET 确认当前状态；用于说明当前事实；是否重试由原动作合同决定 | 当前状态等于目标不能证明原请求执行或审计归属 |
| 订阅 command | 保留原 operation_id+固定 payload；按领域幂等合同显式重试/返回原结果；无充分结果时保持 unknown | 投影、last_event_sequence 或套餐变化不能证明某个 command 执行 |
| Key 创建 | 原 creation_operation_id 对照 metadata；明文丢失按受控密钥处置恢复 | 不能重复 create 取回秘密；未匹配记录不能当未执行 |
| 批次创建 | 原 creation_operation_id 保留；当前列表无法可靠定位 operation，保持 unknown并提供支持线索 | 不按名称/时间猜批次，不重发创建恢复 codes/receipt |
| 确认交付 | 当前内存持有原 receipt，必要时同页 MFA；按原确认接口重试并读取批次交付事实 | Copy/本地 acknowledge 不等于服务端交付确认 |
| 文件 upload intent/PUT | 保留 file ID 与各操作独立 key；字节失败先 GET；未知结果交领域恢复 | intent key 与 PUT key 不强制相同；不自动重传字节 |
| 文件删除 | 原 file ID/key，GET 观察 deleting/deleted；accepted不释放预算 | 列表消失或404不能单独证明物理删除/容量释放 |
| 删除任务 | 原 request/job ID/key；读取真实 checkpoint；只提供合同支持的 retry | 不做跨领域统一 retry |
| Consumer 兑换 | 同 code 对应本次提交的原 key安全保留，仅内存；明确重试沿用原值 | 当前权益变化不是原兑换已执行的充分证据 |

### FE-D02：批次重试语义核验（Phase 03 冻结策略，Phase 04 消费）

已完成核验：原 HTTP create 先生成 codes/receipt，SQL按 creation_operation_id命中已有批次时返回原 metadata，导致重放响应可能携带未入库材料。`54ff797` 已通过独立迁移保存逻辑请求指纹；同参数重放返回 `200 + creation_state=replayed_existing` 及批次元数据，不返回 codes/receipt；异参数返回 `409 IDEMPOTENCY_CONFLICT`。batch create 仍固定 `replay never`，UI 不提供“重发创建以恢复明文”入口；SQL/API 失败用例已保留并复验，`94631ff` 另补 Platform Workspace MFA step-up/状态刷新上下文保持、Files 下载失败/MFA、Policy MFA/409 与 Settings 列表 503 重试/平台设置网络 unknown 不重发故障恢复矩阵，Admin 429/503/409 中文主文案与技术详情隔离矩阵仍在当前基线。Hosted/完整 FE-V08 尚未运行。

## 5. UI 分发与视觉基线

FE-D03（Phase 01 Owner 集成人）：选定 Consumer 可独立安装的共享 UI交付方案，记录决策并实际运行最小样例。允许私有本地可安装 UI产物或 Registry复制必要 UI与样式；不默认为 npm正式发布授权。不能残留 workspace:* 或仓库绝对路径依赖。

当前 sdk-pack 只产出 domain/auth/auth-nextjs/server四包，m5-05安装器重建 dependencies且无 @kit/ui。任务范围明确包括必要的打包/安装/Registry验证脚本、exports、runtime依赖、CSS入口与样式扫描路径。Phase 01在仓库外安装最小中文 Button/Dialog/状态组件并 typecheck/build/浏览器验样式；Phase 07验证完整产物。工具缓存遵循 E:\AppData\工具名，软件安装遵循 D:\APP\Codex\软件名。

Phase 01定稿真实中文 Audit桌面/390px、空/错/加载状态、确认框视觉样例与tokens/密度/排版。确认框样例不提前另造业务流程。后续阶段复用样例；中文标准见 [中文 UI 合同](chinese-ui-contract.md)。

## 6. 旧能力迁移与阶段边界

| 旧能力 | 最终入口 | 迁移阶段/过渡规则 |
|---|---|---|
| 平台 create/open | 平台目录 | 02；仅一份真实 create |
| 账户状态操作 | 平台账户页 | 03基础，04完善 |
| Key create/confirm/revoke | 平台设置/API密钥 | 03基础，05完善 |
| General/Origins | 平台设置 | 05 |
| Plan/Batch | 套餐/兑换码批次 | 04；旧 entitlements验证后redirect |
| 订阅操作 | 平台订阅详情 | 04；保留明确account上下文 |
| 文件/策略 | 平台配置文件 | 05，FE-D01通过后切换 |
| 删除任务 | 运维任务 | 06；旧入口redirect |

Phase 02先抽取未迁操作到一个明确可达的临时 legacy操作section/route，由平台页提供带平台上下文入口，并记录实际地址；阶段内不丢能力、不增加第二套mutation。每项迁移通过后立即删除对应legacy操作，05后清除legacy平台入口。未完成资源不放404导航或假页面。默认顺序执行单个已派发任务；并行只是可选策略，需实际明确派发，不因文档存在自动启动多个 Agent。

## 7. 稳定验收编号

| ID | Owner | 必须观察的结果 |
|---|---|---|
| FE-V01 | 01/03 | Auth布局无登录/MFA循环，深链可达，现有Auth合同不回退 |
| FE-V02 | 01/02 | A→B、搜索乱序、cursor重置不显示旧上下文数据 |
| FE-V03 | 01/03/07 | 退出/过期/另一Tab终态后清缓存与秘密，迟到响应不恢复 |
| FE-V04 | 01 | 同上下文refresh失败保留数据；错误与空态分离 |
| FE-V05 | FE-D01/05 | 精确平台文件过滤、分页、跨平台cursor及权限负向 |
| FE-V06 | 03/04 | 同页MFA后intent/receipt保留且不自动重放mutation |
| FE-V07 | 03/04/07 | Dialog关闭/重开、未知结果重试保持原key和payload |
| FE-V08 | FE-D02/04 | 批次重复创建不产生误导明文，明文丢失恢复边界成立 |
| FE-V09 | 05/07 | 上传不重传；删除202/unknown不假报物理删除或释放预算 |
| FE-V10 | 01/07 | 仓库外UI最小安装及完整Consumer产物构建/浏览器样式 |
| FE-V11 | 02～06/08 | 旧能力不丢失，无双mutation或失效导航 |
| FE-V12 | 06 | 有界数据不冒充全量，缺源不伪造指标/资源时间线 |
| FE-V13 | 01～08 | Admin中文主流程、确认/错误/状态，无障碍文案完整 |
| FE-V14 | 07/08 | Consumer公开/受保护页面及Registry产物中文完整 |
| FE-V15 | 01/08 | 中文五档排版、字体、日期/单位、键盘/焦点可用 |
| FE-V16 | 03/07/08 | 必要英文标识保真、复制原值，DTO/枚举/幂等语义不变 |

创建合同时的初始状态为 NOT_RUN；当前每项必须继续记录具体测试文件/用例定位、命令或手工步骤、环境、SHA、结果和脱敏证据。静态检查、本地运行、Staging和生产分列；已通过的 Local 证据不升级为 Hosted/生产结论。旧测试改 locator 要保留原权限/并发/恢复断言，不能只证明中文按钮出现。
