# 阶段 04：治理状态机与幂等统一

状态：未开始

前置：阶段 02、03。

覆盖：R-01、R-04、R-11、LC-07。

## R-01 Account transition

将账户 lifecycle 定义为严格 transition matrix：

- suspend：仅 active → suspended；
- restore：仅 suspended → active；
- close：仅 active|suspended → closed；
- closed 不可恢复。

实现要求：

1. 锁定目标 account；
2. 先验证 transition；非法/no-op 直接业务冲突；
3. 只有实际 update 成功后，才在同事务写 governance event + audit；
4. event 保存 before/after/reason/operation id；
5. 删除旧 `admin_account_transition` compatibility function，修复后的 canonical function 不保留 v1/v2 双入口。

## R-11 Feedback batch delete

把 `operation_id` 升级为真实幂等键：

- request hash 包含排序后的 feedback ids + reason/scope；
- claim/replay/conflict/in-progress 语义与其他高风险命令一致；
- batch 中每条对象删除必须能识别已由同 operation 完成，而不是把 replay 解释为 not found；
- 同 operation 不重复 increment row_version、不重复 delete_requested event；
- response 保存每条 result，未知结果可安全 replay。

## SQL capability cleanup

对已被 canonical runtime 替代的 v1/v2/v3 function：

- drop function；
- revoke/grant 清单收敛；
- privilege tests 改成同时断言 canonical function 可执行、retired function 不存在；
- 不使用“先保留旧函数以便 rollback”的策略。Git/migration history 已足够承担代码回退记录，运行数据库不需要保留绕路能力。

## 验收

- illegal account transitions 0 state change、0 governance event、0 success audit；
- valid transition 一次 state + 一次 event + 一次 audit；
- feedback batch delete same id replay 返回同一结果；
- unknown outcome 客户端流程可恢复；
- retired SQL functions 不存在/无 executor capability。
