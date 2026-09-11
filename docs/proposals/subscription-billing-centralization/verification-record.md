# 实施与验证记录

> 计划已修订；以下均为待执行模板，不预填PASS、实现完成或功能提交SHA。

## 1. 执行基线

- 架构：[唯一设计](AisenFlow_Subscription_Billing_Architecture.md)；实施时记录其commit或文件摘要：未记录。
- 计划：[总计划](00-master-plan.md)；版本/commit：未记录。
- 工作目录/branch/HEAD/remote/工作区归属：未验证。
- Node/pnpm/Supabase/Deno/OS、Local DB/Docker、可用调度：未验证。
- 基线命令失败与既有未提交内容：未验证。
- 当前用户实际派发阶段与外部操作授权范围：未记录。
- 历史研究d3c25e9不是执行起点；本轮文档修订不作为任何功能验证。

## 2. 阶段状态

| 阶段 | 状态 | 实现/剩余 | commit/push |
|---|---|---|---|
| BILL-01 | 未开始 | G-DEV/G-PROVIDER均未验证 | 未记录 |
| BILL-02 | 未开始 | 全部 | 未记录 |
| BILL-03 | 未开始 | 全部 | 未记录 |
| BILL-04 | 未开始 | 全部 | 未记录 |
| BILL-05 | 未开始 | 全部 | 未记录 |
| BILL-06 | 未开始 | 全部 | 未记录 |
| BILL-07 | 未开始 | 全部 | 未记录 |

状态可用未开始/进行中/已阻塞/验证失败/验收通过待推送/已交付。已交付仅指该阶段明确范围，真实渠道和运维门槛另列；整体未满足不能Completed。

## 3. 门槛与协议证据

| 门槛 | 状态 | 证据/缺口 |
|---|---|---|
| G-DEV | NOT_RUN | 本地合同/crypto/fixture未验证 |
| G-PROVIDER | NOT_RUN | 真实渠道未验证 |
| G-OPS | NOT_RUN | 调度/恢复/开关未验证 |

| 协议项目 | 官方来源/日期/版本 | 脱敏操作与结果 | 状态 |
|---|---|---|---|
| custom_order_id传递/长度/query回显 | 未记录 | 未记录 | NOT_RUN |
| 重复链接/调价/撤销能力 | 未记录 | 未记录 | NOT_RUN |
| plan/type/SKU/count/month/currency | 未记录 | 未记录 | NOT_RUN |
| 签名原文/可信公钥/query权威 | 未记录 | 未记录 | NOT_RUN |
| discount/redeem/零元 | 未记录 | 未记录 | NOT_RUN |
| 限流/分页/历史可查/失败 | 未记录 | 未记录 | NOT_RUN |
| Supabase固定版本/runtime/相关更新 | 未记录 | 未记录 | NOT_RUN |

不保存真实密钥、code、完整URL、订单个人数据；凭据只标configured/missing。真实付款授权依据单列，不从计划推断。

用户提供的脱敏 Provider 调试参考：[afdian-debug-reference.md](afdian-debug-reference.md)。当前样例未包含 `custom_order_id`；该事实已登记为 G-PROVIDER 待验证项，不得将样例视为自动用户绑定证据。用户消息中的 API Token 未保存，建议重新生成。

## 4. 每阶段记录模板

- BILL-XX/日期/负责人/起始HEAD：未记录。
- 实际变更文件、实现行为与合同版本：未记录。
- 依赖门槛/计划偏差/必要的新决策：未记录。
- 验证命令与结果、失败及修复复测：未记录。
- 静态、本地、Provider、生产各自覆盖范围：未记录。
- 代码commit、push结果、远端SHA、记录更新commit：未记录。
- 未完成/阻塞/下一满足依赖任务：未记录。

实现时逐阶段追加，不覆盖失败历史；记录自身SHA可单独提交，不循环amend。

## 5. 要求覆盖与实际测试

| 要求ID（总计划R01～R17） | 测试路径/用例 | 环境/被测commit | 命令/exit code | 结果/证据 |
|---|---|---|---|---|
| 全部 | 未记录 | 未记录 | 未运行 | NOT_RUN |

重点独立记录：Checkout长幂等/响应丢失、两笔真实款、finalized重放、ACK后崩溃、lease/fence、分页移动与处理重试、99年顺延/到期/跨世纪日期、Admin真永久兼容及通用替代链、删除/归档/批次并发、服务端故障授权。

## 6. 迁移与保留

- 旧Plan/未结束Grant/可兑Batch/历史码合法格式分布：未验证。
- FK/锁顺序/匿名保留/保留期/责任人/清理checkpoint决策：未冻结。
- CLI命令与迁移文件、升级fixture/空库reset：未执行。
- 普通7天幂等清理与长期绑定、删除后迟到通知：未验证。
- correction链及退款目标、任务/结算/删除竞态：未验证。
- schema兼容窗口、forward-fix/恢复演练：未验证。

## 7. 调度与上线准备

- 调用方/认证/频率/批量/超时/限流预算：未确定。
- 报警阈值/接收责任人/oldest_pending目标：未确定。
- 新购买/入站/结算/重试独立开关：未验证。
- 调度停机恢复/密钥轮换/积压与重复结算演练：未验证。
- G-PROVIDER/G-OPS通过和真实购买启用授权：未记录。

## 8. 最终结论与交接

实现覆盖：NOT_RUN。文档/合同检查：实施时记录。真实渠道：NOT_RUN。生产观察：NOT_RUN且不在默认范围。Proposal Completed：否。

记录当时未提交修改归属、需用户决策事项、已解决与剩余失败；不得将本地模拟成功转换为真实支付可用。
