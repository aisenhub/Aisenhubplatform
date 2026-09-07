# 技术验证与验收门槛 DP1

本文件定义用例ID与完成证据；当前所有应用用例为NOT_RUN。实现任务引用ID，报告必须绑定commit与真实环境。

## 1. 最小技术探针

| 探针 | 固定实验 | 成功标准 | 失败处理 |
|---|---|---|---|
| SP-SOURCE | 固定Makerkit commit，审查manifest/lock/license/scripts，隔离安装及build | 可重现；无隐式全局安装/删除；记录实际依赖 | 定位依赖/脚本问题，先修清理方案 |
| SP-SQL | Edge及Node分别以真实executor经pooler调用private测试函数 | 允许入口成功，表DML/其他角色函数/Data API拒绝；连接不泄漏 | 不换成service-role绕过，更新ADR |
| SP-AUTH | 密码登录→SSR刷新→MFA→记录proof→退出→复用旧JWT | proof绑定session，刷新不延长，退出后新请求拒绝 | 明确Provider版本与受支持方法，修adapter |
| SP-UPLOAD | BFF→Edge受控接收1MiB与1MiB+1，chunked、伪造长度、断流 | 超限Storage调用为0；内存/超时有界；未知写入仍占用 | 调整host/adapter，不启用浏览器直传 |
| SP-TXN | 两连接同账户不同operation并发，写入日志后注入异常 | 串行效果正确，失败无部分Grant/Audit；不同账户不被全表锁 | 修锁顺序/事务边界 |

探针使用专用测试表/函数或可删除实验schema，不创建生产资源。探针代码不能未经评审直接成为生产绕过路径。Local和Staging结果分别记录，Local PASS不覆盖托管能力。

## 2. Gate定义

| Gate | 必要条件 | 不代表什么 |
|---|---|---|
| G0-L | 固定工具、clean install/build、Local Supabase、探针可运行、CI基础 | 不代表托管pooler或OAuth验证通过 |
| G0-S | SP-SQL/SP-AUTH/SP-UPLOAD在拟用host与Staging通过 | 不代表完整业务实现 |
| G1 | 完整基础迁移、真实角色负向、审计/幂等/门闩用例通过 | 不代表所有领域表已上线 |
| G2-L | 本地身份/平台纵向链路、Profile版本并发、默认拒绝 | 不代表真实Google/SMTP可用 |
| G2-S | G0-S+托管SSR、OAuth/邮箱、退出撤销与Admin近期MFA通过 | 不代表权益/文件已完成 |
| G3 | 权益、兑换、交付、重放与并发测试通过 | 不代表支付已接入 |
| G4-L | 文件/任务故障矩阵、严格预算及墓碑清除本地通过 | 不代表未知写入在真实host已可运维 |
| G4-S | G4-L+实际host上传压力、Storage中断与对账演练 | 不代表备份可恢复 |
| G5 | 新项目安装真实产物并全链路E2E，Secret bundle扫描通过 | 不代表生产发布已授权 |
| G6 | 配置确认、联合恢复、轮换、性能、上线/恢复清单通过 | 仍需实际发布任务和对应授权 |

M3/M4可在G2-L后开展本地实现，但托管集成结论依赖G2-S。不得用生产环境完成首次破坏性实验。

## 3. 用例目录

| ID | 行为与判定 |
|---|---|
| V-BASE-01 | 固定Node/pnpm/lock在空依赖目录安装、typecheck/build；不需全局默认安装 |
| V-BASE-02 | apps/admin和Consumer空壳都能build，Supabase从根目录运行，不残留web路径脚本 |
| V-DB-01 | 空库reset、第二次reset、从上一迁移集upgrade一致 |
| V-DB-02 | anon/authenticated直接表/函数/Storage访问拒绝；account/admin/job角色权限矩阵正确 |
| V-DB-03 | 同平台异Plan Batch、跨平台FK、事件同账户/同code组合被数据库拒绝 |
| V-DB-04 | 每个有updated_at的可变表trigger更新；只读字段不被普通角色改写 |
| V-TXN-01 | 同scope/key同hash只作用一次，异hash409；pending随回滚消失 |
| V-TXN-02 | 成功状态与Audit同提交，业务拒绝可记录，SQL异常不留下半条业务 |
| V-AUTH-01 | 错issuer/audience/signature/expired/session/项目JWT拒绝，Provider允许字段正确校验 |
| V-AUTH-02 | Cookie刷新no-store、并发用户不串会话；恶意returnTo/CSRF/Origin拒绝 |
| V-AUTH-03 | AAL1/Admin伪造拒绝；proof跨session/超5min/退出/替换后失效，刷新不续期 |
| V-AUTH-04 | 密码、真实Google、邮箱确认/重置、Link冲突及local/global logout符合合同 |
| V-ACCOUNT-01 | 并发activate只一账户，Free无Grant；已有账户不受allow_activation关闭影响 |
| V-ACCOUNT-02 | A Key不能访问B状态；Global JWT经B合法入口可用；Admin专用身份拒绝业务 |
| V-ACCOUNT-03 | Suspend/Close/Disable阻断新授权，principal仅诊断；中央故障503不放行 |
| V-ACCOUNT-04 | Profile/Preferences If-Match正确，两个并发PATCH仅一个成功；归属不可改 |
| V-ACCOUNT-05 | 公开Plan无需用户但需要平台Key，字段白名单且不触发activate |
| V-ENT-01 | Free→Pro、同Plan续期、Plan冲突、永久拒绝重复、到期回退/无默认 |
| V-ENT-02 | 月末/闰年/UTC等于end，暂停不补时，撤销缺口不压缩后续Grant |
| V-ENT-03 | 固定as_of影子Projection与线上结果一致；到边界同步重算 |
| V-REDEEM-01 | 同码10次只有一次实际授予；同幂等重放可多次返回原成功 |
| V-REDEEM-02 | 无订阅多码、兑换与AdminGrant并发均不丢权益，账户锁稳定 |
| V-REDEEM-03 | Batch禁用和兑换两顺序、未确认交付/过期/归档Plan拒绝 |
| V-REDEEM-04 | 26均匀字符、HMAC轮换；生成响应丢失不能恢复明文或激活Batch |
| V-FILE-01 | 真实字节超限/0字节/压缩体/伪长度拒绝，超限在任何Storage调用前发生 |
| V-FILE-02 | 20个意图竞争仍满足count/bytes上限；降低策略不删现有数据 |
| V-FILE-03 | 同fileId同内容重试不覆盖，异内容409，接收租约排斥并发 |
| V-FILE-04 | 满额Replace拒绝且旧文件完整；成功替换旧对象删除前仍计费 |
| V-FILE-05 | Storage成功DB失败、超时迟到写入、一次HEAD未发现不能释放预算 |
| V-FILE-06 | 删除失败/备份屏障保留预算；旧fence不能写新状态，路径永不复用 |
| V-FILE-07 | 私有下载no-store/attachment/nosniff，跨账户拒绝，Admin近期MFA审计 |
| V-JOB-01 | 多worker同job排斥、租约超时、10次重试转人工，unknown持续占用 |
| V-DELETE-01 | deleting期间activate/Grant/上传拒绝，断点恢复清除后墓碑FK完整 |
| V-SDK-01 | Server包不能进入Browser，精确字段/错误码与OpenAPI匹配 |
| V-SDK-02 | 超时预算/可重试集合/幂等key一致，上传不自动重传 |
| V-UI-01 | Admin敏感操作服务端校验；Profile冲突、批次确认、文件剩余预算UX正确 |
| V-INTEGRATION-01 | 全新消费者安装打包SDK+Registry，无核心代码修改接入全链路 |
| V-OPS-01 | DB+对象manifest联合恢复、hash完整、删除墓碑重应用 |
| V-OPS-02 | 恢复后旧session/Key/未用Code失效，各Secret轮换成功 |
| V-OPS-03 | 目标负载/延迟/内存/连接指标实测，任务告警送达并可重现 |

## 4. Fixture及证据规则

固定3平台A/B/C、3用户U1/U2/U3、独立Admin，A/U1与B/U1 active、A/U2 suspended、C/U3 closed；每平台同名Pro用于混淆攻击。用户ID由Local Auth生成后映射别名，不伪造auth schema。时间测试使用隔离数据库可注入测试时钟或参数化纯查询，生产写入口不暴露任意as_of。

并发测试使用至少两个真实连接和明确barrier/事务同步，不靠sleep碰碰运气；网络故障注入层记录Storage调用次数但不记录文件或Secret。预期拒绝必须断言HTTP、数据库副作用和Audit，不只断言页面提示。

报告包含任务ID、commit、运行命令、环境、用例ID、PASS/FAIL/NOT_RUN、脱敏输出和限制。详细原始日志放受限CI artifact，公开仓库只保留脱敏摘要。只有文档检查时明确写“未运行应用测试”。
