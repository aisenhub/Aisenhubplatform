# 修复Agent交接入口

状态：执行中；已按 TASK ID 形成小提交并推送 `main`，未完成任务仍须逐项授权和验证。proposal 记录与代码证据必须保持一致，不得把外部环境 NOT_RUN 写成 PASS。

## 可派发提示词

~~~text
请实施本次明确指定的 TASK-XXXX，仅执行该任务和必要前置检查。
先读根AGENTS.md、docs/README.md、docs/architecture/overview.md、docs/agents.md，
再读本proposal的plan.md、design.md、repair-issues.md、repair-matrices.md、
verification-record.md、对应阶段文件和归档来源；最后核对当前源码/配置/测试。
核对HEAD/branch/status，记录已有未提交迁移配置归属，保护其他工作。
前置未完成只做独立准备；按TASK保留失败用例→修复→同步所有消费者→实际验证。
不从历史PASS、计划状态、HTTP200推断成功；Provider/DB/Grant/Job/Audit/UI逐层核对。
不要自动连续实施其他TASK，不擅自恢复旧续购规则、部署、付款或配置Secret。
~~~

## 执行纪律

- 问题F01–F17唯一计数，任务TASK是分解不是新问题；依赖表和状态在执行前重验。
- SQL private领域过程唯一业务写入口，最小executor/RLS/MFA/CSRF不放宽；浏览器不直连SQL/私有Storage。
- 新迁移固定CLI2.111.0生成；先help核对，追加forward-fix；旧已应用迁移不可修改，交易/码/审计不可删除回滚。
- 复用工具，软件D:/APP/Codex/工具名，缓存E:/AppData/工具名，项目依赖按约定；不默认安装C盘。
- 默认单Agent串行；只有用户明确授权并行才分配文件所有权，SQL/OpenAPI/DTO/同一页面不能并写。
- 文档和示例测试不要包含真实Token/Key/密码/码/OAuth/MFA/用户数据；仅使用虚构fixture。
- 验收运行现有真实命令；新增用例/runner先落地再运行；test:api占位不计通过。结果仅PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED，范围单列。
- 记录被测HEAD、命令、退出码、失败及复测、最终DB/Provider/UI、残留清理；不预填通过。
- 阶段完成后架构/合同随实际实现同步；不能等最后才同步公共消费者。

## Git与外部操作

本轮禁止commit/push。后续实施遵循届时用户派发和根AGENTS的阶段同步规则：仅暂存明确文件、小提交、获授权仓库推送并核对远端SHA；不能把本地commit称为已上传。最新用户限制优先，计划文字本身不是新增授权。禁止force push、重写历史、自动merge/main/Release、生产部署、费用变更和破坏性恢复。Staging/真实付款/Provider配置必须确认本次具体范围，旧记录中的授权不自动重放。

## 下一任务

[RC-00 TASK-0001](phases/00-repair-baseline-and-gates.md#task-0001)可作为最小只读准备任务；实现F01仍需另行派发TASK-0301。
