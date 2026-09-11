# M5-01 资源、包与模板兼容矩阵

更新：2026-09-11  
任务：M5-01  
基线：`task/M5-01-compatibility-matrix`

本盘点以当前工作树和冻结的Account/Admin OpenAPI为准。它是M5实现输入，不将 workspace 源码、Local通过或文档合同表述成已发布包/Registry/完整UI。

## UI设计原则

MakerKit 仅作为工程结构、组件组织和实现边界的参考，不作为产品视觉模板。Admin 与 Consumer 的视觉可以独立定制；UI 评审统一检查四项：操作是否顺畅、信息是否清楚、状态反馈是否及时、页面是否有质感。

## 1. 当前资源覆盖

| 资源 | 领域入口 | HTTP/OpenAPI | SDK | 当前UI/消费者 | 缺口承接 |
|---|---|---|---|---|---|
| 平台/Origin/Key/账户 | M2 SQL与Account/Admin受控入口 | 18 Account、36 Admin已冻结；部分操作仍contract-only | `account-server`已有principal/activate/profile/preferences/subscription/redeem子集 | Admin已覆盖列表/筛选/轮换/状态页面；`template-preview`展示平台端账户设置参考页，并保留可选 Supabase Auth 验证示例，不宣称生产账户服务 | M5-03 Local页面与资源搜索已交付；生产账户能力仍按 Account API 合同接入 |
| Plan/订阅/批次/Code | M3 Local SQL、Account API、Admin计划/批次/订阅路由 | Admin路径已有Local-only实现，Plan/批次/订阅页面已接入 | `account-server`仅订阅读取/兑换方法 | `template-preview`展示四档固定套餐、爱发电等待支付、永久订阅联系管理员和激活码参考交互；Admin覆盖Plan/批次/订阅管理 | 当前页面不代表生产支付回调、兑换结算或下游用户应用集成 |
| 文件/策略/删除任务 | M4-01合同与M4-02～09 Local领域入口 | Account六个文件操作及Admin file/deletion-jobs已接入，部分托管能力仍待验证 | 尚无文件方法 | Admin文件/删除任务页面保留真实管理能力；`template-preview`展示配置文件列表、上传、删除和本地状态参考交互 | 生产Storage、权限、配额和删除仍按文件专题合同接入 |
| 审计 | M1事务 append 基础 | Admin audit资源已冻结并接入受控只读查询 | 尚无Admin审计SDK | Admin audit页提供服务端分页、q筛选和脱敏投影 | M5-05补全新Consumer联合验收 |
| 用户Auth能力 | M2 Auth adapter；T12-R1已交付请求级SDK/refresh/PKCE callback | Auth SDK职责边界已形成 | `account-auth`/`account-auth-nextjs`职责边界已存在 | `template-preview`的账户页保留 Supabase Auth 邮箱/手机号验证码绑定和旧密码校验参考；不把登录、会话同步、真实 Account API 或生产用户状态宣称为当前页面默认完成 | 生产平台按需接入 Auth/API；外部用户应用集成另建任务 |

## 2. 包与构建兼容

| 包 | 当前exports/依赖 | 目标兼容规则 | 当前判定 |
|---|---|---|---|
| `@kit/account-auth` | `.`/`./browser`/`./server`→`dist/index.js`；纯TS，无Supabase依赖 | browser/server均可导入；只提供Auth合同、意图和校验 | PASS（Local tarball）；内容与边界扫描通过 |
| `@kit/account-auth-nextjs` | `.`/`./server`→`dist/index.js`，`./browser`→`dist/browser.js`；固定`@supabase/ssr`与`@supabase/supabase-js` | browser/server显式边界；server client、Cookie/PKCE/refresh不得进入浏览器bundle | PASS（Local tarball）；独立消费者类型检查通过 |
| `@kit/account-server` | `.`/`./server`→`dist/index.js`；无browser export，依赖Auth/domain | 仅server；API错误、request_id、ETag、分页、超时/幂等方法与OpenAPI一致 | PASS（Local tarball）；server包浏览器导入被拒绝 |
| `@kit/domain` | contracts/redemption/errors/validation公开exports；无Node生产依赖 | Node/Edge双运行时；不含生产权益/配额算法第二实现 | PASS（Local tarball）；Node/Edge导入通过 |

版本策略固定为SemVer、API `/v1`；包当前均为 `0.1.0`、`private`，没有npm scope、Registry host或正式发布权限。M5-02必须先决定精确构建版本、依赖白名单、browser/server exports、tarball内容与校验和；在M5-06的X05与发布授权前不得声称可从npm/正式Registry安装。

## 3. 模板和安装覆盖

当前平台端参考页面按专题固定为：`account-settings-page`、`config-files-page`、`subscription-page`、`activation-code-ui`、`api-adapter-example`。页面可以展示 Auth 验证和业务状态参考，但不把生产账户状态、订阅权益或文件 Storage 的实现直接复制到页面。

当前 `apps/template-preview` 已覆盖平台端参考页面与 API 接入示例；`apps/admin`已覆盖M5-03 Local Admin资源页面。`registry/`仅为Local metadata，不能把preview或Local metadata当正式Registry或生产部署物。页面必须只复制平台端 UI 和 API 适配示例，不复制授权、Ledger、日期、配额、Storage或删除算法，也不要求下游用户应用接入。

独立平台端参考页面的最低安装验收由M5-05重新基线：空Next项目从本次真实tarball和固定Registry安装，不使用workspace链接；账户、配置文件、订阅和激活码页面完成render、typecheck/build、响应式与 API 示例扫描；可选 Auth 验证的依赖边界和未接通后端状态必须明确记录；执行 browser bundle Secret 扫描。

## 4. 兼容性风险与冻结点

1. M4文件字段仍以M4-01冻结附录为准；M4-10前不在M5猜测status、write_outcome、预算或删除job字段。
2. T12-R2普通用户近期认证仍缺安全发行入口；M5不能用JWT `iat`、AAL或前端flag代替proof，敏感模板必须保持拒绝。
3. Admin的Key创建/轮换、批次交付确认、敏感MFA过期恢复必须保留非Secret输入并重新验证，不能在UI中恢复明文Key/Code。
4. 依赖清单须保留固定pnpm/Node/Next版本和锁文件；不引入React Admin、Refine或第二套Query/Form/UI框架。
5. M5-01仅完成覆盖盘点和承接映射；M5-02/03/04各自交付真实代码与测试，M5-05才判定G5-L，M5-06另需X05及明确发布授权。

## 5. 验收映射

| 验收 | 当前状态 | 后续责任 |
|---|---|---|
| V-SDK-01/02 | PASS（Local tarball） | M5-05继续做全新Consumer与Registry联合安装；M5-06仍需正式发布 |
| V-UI-01 | PARTIAL（Local页面与关键浏览器路径已验证） | M5-05补全新Consumer联合浏览器路径 |
| V-INTEGRATION-01 | 历史 PASS（Local tarball独立安装 + 双Origin/Platform浏览器业务链路） | 不覆盖当前平台端参考页面范围；未来外部应用接入需新任务 |
| G5-L | 历史 PASS（旧 Consumer 范围） | 当前平台端参考页面需按新范围重新验收；M5-06另行处理正式发布 |
| G5-P | NOT_RUN | M5-06，依赖X05和发布授权 |
