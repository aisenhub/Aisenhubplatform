# v1.2 审核问题闭环

修订日期：2026-09-07。用户确认：全部自营平台；配置文件在进入存储前严格校验真实大小和配额。

本表的“已落实”仅指设计文档已修订；运行实现、自动化测试和生产演练仍待后续完成。

| 原审核问题 | 已落实的修改 | 实现验收 |
|---|---|---|
| Free阻止Pro兑换 | [权益规则](subscription-redemption.md)：Free为读取回退，不生成永久Grant | Free→Pro、到期回退、无默认 |
| 无订阅行时并发锁无效 | [事务](subscription-redemption.md)：账户行作稳定锁，Admin共用流程 | 多码首次及Admin并发 |
| Batch禁用校验与并发缺失 | 同一平台锁顺序，锁后重查Batch状态/到期/交付 | 禁用与兑换两种提交顺序 |
| 事件表租户关系、缺失索引字段 | [SQL](subscription-redemption.md)：事件platform_id、同账户FK、成功码与Grant绑定 | 敌对INSERT、索引创建 |
| Code与Batch套餐可能不一致 | 三字段platform/plan/batch FK | 同平台不同Plan组合拒绝 |
| 共享JWT不是平台绑定身份 | [信任模型](auth-security.md)：明确自营前提，管理员专用身份 | 正常身份复用与Key越权分别测试 |
| 私有RPC不可通过默认Data API调用 | [数据库路径](auth-security.md)：SQL事务连接池+独立executor | 实际角色执行与浏览器拒绝 |
| Ledger无法确定性重放 | 正向Grant+有序revoke/pause/resume事件、固定区间和补偿规则 | 影子Projection等价、撤销缺口 |
| 文件声明大小和签名滥用 | [受控上传](config-files.md)：有界读取真实字节后才写Storage；取消浏览器签名 | 超限时Storage调用次数为0 |
| 清理竞态、未知写入提前释放 | 所有未结算预算持续计入，lease不伪装Storage fence | 超时迟到写入、租约失效 |
| deleting与满配额Replace | 物理删除前计费，新旧同时计入，不隐藏超额 | 满额拒绝且旧文件完整 |
| 缺对象独立备份 | [联合恢复](operations.md)：对象hash/manifest、删除屏障、RPO/RTO | 隔离项目联合恢复 |
| AAL2不代表近期MFA | [Admin](auth-security.md)：会话绑定5分钟step-up，refresh不续期 | AAL1/过期证明/退出后JWT |
| 幂等失败审计被整体回滚 | [幂等](subscription-redemption.md)：业务拒绝提交无副作用结果，系统异常回滚+独立日志 | SQL/网络各故障点 |
| Global Delete被restrict阻塞 | [清除](auth-security.md)：任务门闩、墓碑账户、匿名化、解除依赖再删Auth | 中断续跑与FK完整 |
| signup开关语义失真 | allow_signup改allow_activation，全局Auth注册另控 | 关闭激活但旧用户可用 |
| 明文一次性交付丢失 | pending_delivery→确认激活；丢响应不可兑换，过期禁用 | 生成/确认响应丢失 |
| Pricing要求登录 | [接口](api-sdk.md)：平台凭据认证的公开套餐，无用户Token | 未登录Pricing可用，无Secret暴露 |
| 中央授权故障/缓存未定义 | V1不跨请求缓存授权，预算内有限重试，失败拒绝 | 503不放行、停用后新请求 |
| 兑换码示例熵不足 | 31字符均匀采样26随机字符，统一示例约128.81bit | 长度/字符集/采样算法测试 |
| 安全/审计实施过晚 | [主文档实施顺序](architecture.md)：按领域同步交付测试和审计 | 每功能merge gate |
| 重复章节互相冲突 | 主文档收敛，专题单一维护；旧版明确归档 | 活跃文档链接与术语一致性 |
| Admin可能形成第二套业务逻辑 | 共用领域数据库过程，Admin独立授权包装 | 两入口同输入同领域结果 |
| 旧SDK名与新分层矛盾 | 统一三个包，移除未发布兼容别名 | SDK/Registry实际安装 |
| V1过度扩张风险 | 保留单体、自营、无组织、无支付、无事件总线 | 新平台仅配置接入 |

## 兼容与状态说明

当前没有代码或生产数据，因此v1.2直接修订设计，不生成虚假的线上迁移记录。v1.1中的allow_signup、浏览器Signed Upload、外部complete/download-url、Free永久Projection和旧SDK别名都不是v1.2合同。

未来若发现已有未纳入仓库的消费者使用这些旧接口，必须先盘点并制定版本迁移，不能据本次文档修订直接破坏实际服务。

本次文档验证只检查结构、相对链接、SQL设计内部关系与审核覆盖；不能替代Postgres运行测试、真实Supabase验证或恢复演练。
