# M5 SDK、Admin与Registry成品实施规格

状态：IN_PROGRESS；M5-02已完成Local tarball打包、浏览器/服务端边界、独立消费者类型检查和Node/Edge导入验收，M5-03 Admin、M5-04 Registry/模板及M5-05联合验收仍未交付。依赖M2～M4合同与纵向链路，完成一致性、交互、打包和复用验收。DP2已列出[M5-01～06任务与资源覆盖表](../roadmap-dp2.md)，盘点可提前，M4-10后冻结文件集成细节。

## 1. 范围

将account-auth、account-auth-nextjs、account-server形成正式版本产物；完善Admin资源管理与用户模板；建立全新Consumer安装测试。沿用Makerkit/shadcn现有样式基础，不重新发明UI体系。

没有npm/Registry发布权限时可完成本地tarball验收，不能将本地package当作已发布产品。正式命名空间和域名属于X05外部输入。

## 2. SDK合同

account-auth只含Provider-neutral意图与Auth adapter；Next adapter管理Cookie/PKCE/Callback/BFF；Server SDK保持server-only，所有业务能力通过Central API。

用OpenAPI校验真实请求/响应序列化，不只比较TypeScript类型。错误码、request_id、ETag、pagination、null/free/perpetual语义必须一致。

重试策略遵守3秒业务授权总预算和5秒普通请求；429遵守Retry-After，业务拒绝不重试；上传流不自动重发，生成码不重新生成明文。超时行为用可控时钟/transport测试。

包exports显式browser/server边界，默认不暴露internalSQL/Secret client；browser构建导入account-server应失败。发布tarball不包含测试env、原始日志或fixture Token。

## 3. Admin界面

资源页：平台/Origin/Key/账户/Plan/订阅/批次/Code mask/文件/审计/任务。所有页面复用已存在的领域API，不因制作表格而新增直连表的权限。

必须具备loading/empty/error、分页/筛选、状态可见性；敏感动作触发近期MFA，过期后保留表单非Secret内容并重新验证。reason为必填但提示勿含个人信息。

重点流程：Key轮换交付→新Key确认→撤旧；Batch一次下载→明确确认→激活；Plan归档对默认Free约束；Profile412冲突提示；文件unknown/满额Replace/删除中预算；purge blocked原因展示。

不提供恢复Code明文、任意调整Projection或直接编辑job checkpoint按钮。后台权限在服务端每次验证，不依赖隐藏菜单。

## 4. Registry与模板

统一品牌配置name/logo/routes；模板只包含UI、BFF路由及SDK胶水。Login/Signup/Forgot/Reset/OAuth、公开Pricing、Profile/Preferences、Subscription/Redeem、Files/UserMenu完整可安装。

Registry构建固定CLI版本，记录兼容SDK范围、实际构建版本及校验和；原始版本URL不可变。复制UI后允许产品定制，不复制领域计算。

模板包含同源BFF安全默认、上传进度/状态查询、错误及无权限状态；公开Pricing不强迫登录、不暴露Key。未激活、停用、关闭、权益暂停分别展示正确引导。

## 5. 真实消费测试与发布

CI新建独立Next项目，安装本次pack的三个SDK与Registry，不使用monorepo workspace链接替代；连接隔离测试后端，创建第二Platform，仅配置即可接入。

完成V-SDK-01/02、V-UI-01、V-INTEGRATION-01；typecheck/build/E2E涵盖登录/刷新/激活/Profile/兑换/文件/停用。扫描浏览器bundle和打包文件，证明不含伪装成NEXT_PUBLIC的后端配置。

发布前固定scope/host、SemVer、变更说明及兼容矩阵；外部发布凭据进入Secret Manager，公有PR不能获得。本地真实打包安装满足G5-L；获得明确产物发布授权、完成正式地址发布和安装回归后才满足G5-P。若X05缺失，G5-P为BLOCKED，不影响如实记录G5-L结果。

交付可安装产物、Registry清单、示例配置、Admin交互与安装报告。主后端不新增平台hardcode分支是强制验收。
