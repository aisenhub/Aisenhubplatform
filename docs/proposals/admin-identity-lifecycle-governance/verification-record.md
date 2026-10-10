# OPT-003 实施与验证记录

## 项目与基线

- 优化目标：统一 Global Identity 与身份删除生命周期治理入口。
- 实施范围：Identity lifecycle read/API/OpenAPI、Admin Identity detail、deletion-jobs 子视图、Operations 兼容 redirect、内部深链迁移。
- GitHub 仓库：`aisenhub/Aisenhubplatform`。
- 工作分支：`codex/opt-003-identity-lifecycle`。
- 起始 commit：`425173ea70efc19e5410a0a4f0e25e7e30204591`。
- 初始工作区状态：clean；`main == origin/main` 后创建任务分支。
- 运行环境：Local Windows + Docker Desktop + Local Supabase；Production 不在授权范围。
- 已知基线失败：无；OPT-002 canonical R3 在起始 main 前已通过。

## 阶段状态总表

| 阶段 | 名称 | 状态 | 已完成 | 剩余/依赖 | commit | push/GitHub |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Identity lifecycle 数据/API 合同 | 进行中 | 最新 main 与现有调用链核对、正式设计冻结 | migration/API/OpenAPI/Local R3/交付 | 未验证 | 未验证 |
| 02 | Unified Users lifecycle UI | 未开始 | 无 | Phase 01 已交付 | 未验证 | 未验证 |

## 阶段实施记录

### 阶段 01：Identity lifecycle 数据/API 合同

- 实际修改文件及职责：当前仅 Proposal 文档；产品代码未开始修改。
- 已实现行为：未开始。
- 冻结的数据、接口和跨阶段契约：保留 existing deletion-job mutation APIs；新增只读 lifecycle function 与 `GET /accounts/{userId}`；详情不暴露 request session/lease/fence。
- 与计划的偏差、原因和影响：无。
- 新增依赖及必要性：无。
- 未完成或未验证内容：全部 Phase 01 产品实现与 R3。

## 验证记录

| 日期 | 阶段 | 代码版本 | 命令/操作 | 环境 | 退出码 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-10 | 计划/01 | `425173ea` + plan-only worktree | 最新 main、Accounts/Operations、Global Delete migrations、Admin API/OpenAPI、architecture/reference 重新核对 | Local | 0 | PASS：确认 Global Delete 状态机可复用；缺口是 Identity lifecycle 聚合读取与 Admin IA |

## GitHub 交付记录

| 阶段 | commit SHA | 分支 | push | 远端核对 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 01 | 未验证 | `codex/opt-003-identity-lifecycle` | 未验证 | 未验证 | 未验证 |
| 02 | 未验证 | `codex/opt-003-identity-lifecycle` | 未验证 | 未验证 | 未验证 |

## 交接信息

- 下一阶段从哪里开始：Phase 01 新 forward migration。
- 必须先解决的问题：无产品决策阻塞。
- 可直接复用的接口和能力：`getAdminAuthUserById`、`admin_identity_accounts`、`admin_deletion_job_start/list/read/retry`、Admin recent-MFA/ConfirmActionDialog。
- 不应重复实施的工作：Global Delete worker、checkpoint、lease/fence、Auth 删除与匿名化算法。
- 当前未提交修改及归属：Proposal 文档，归属 OPT-003。
- 需要用户决定的事项：无。
