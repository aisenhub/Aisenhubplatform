# Authentication & Session Upgrade — Package Manifest

> 本压缩包用于 `Aisenhubplatform` 的 `01. Authentication & Session` 完整改造计划。  
> 本版已吸收后续 `Frontend Experience & State` 架构对 Auth 消费层提出的补充要求。  
> 所有实施状态仍为**未开始/未验证**。

本次已核对的计划根目录为（无需再次搬移）：

```text
docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/
```

本包共包含 **13 份 Markdown**（11 份计划/交接/记录文档 + 2 份架构参考）。

## 1. 执行入口

推荐新 agent 按此顺序读取：

1. [`00-master-plan.md`](./00-master-plan.md)
2. [`frontend-integration-contract.md`](./frontend-integration-contract.md)
3. [`architecture-coverage-matrix.md`](./architecture-coverage-matrix.md)
4. [`verification-record.md`](./verification-record.md)
5. 当前 Phase 文档
6. [`agent-handoff.md`](./agent-handoff.md) 中的执行规则与可复制提示词

## 2. 实施阶段

```text
Phase 01 Contract + Logout Foundation
   ↓
Phase 02 Shared Browser Session Runtime
   ↓
   ├──────────────┐
   ↓              ↓
Phase 03        Phase 04
Consumer        Admin + MFA
   └──────┬───────┘
          ↓
Phase 05 Integration + Multi-tab + Regression + Cleanup
```

阶段文件：

- [`01-contract-and-logout-foundation.md`](./01-contract-and-logout-foundation.md)
- [`02-shared-session-runtime.md`](./02-shared-session-runtime.md)
- [`03-consumer-session-adoption.md`](./03-consumer-session-adoption.md)
- [`04-admin-mfa-session-adoption.md`](./04-admin-mfa-session-adoption.md)
- [`05-integration-validation-cleanup.md`](./05-integration-validation-cleanup.md)

## 3. 跨阶段合同

### [`frontend-integration-contract.md`](./frontend-integration-contract.md)

冻结新增的 Auth ↔ Frontend Experience 消费语义：

- SessionSnapshot → UI state；
- refreshing vs initial loading；
- Auth error → Presented surface；
- RetryRequired → Mutation state；
- step-up intent 恢复；
- safe returnTo / deep-link；
- logout/expired terminal cache cleanup；
- multi-tab terminal UI reaction；
- Admin Security ownership；
- MFA enrollment one-time secret UX；
- Auth responsive/accessibility 最低验收。

它**不改变** single-flight refresh、replay、AAL2、recent proof、CSRF、Origin、RLS 等核心安全合同。

### [`architecture-coverage-matrix.md`](./architecture-coverage-matrix.md)

用于交付前和接手时核对：

- 原 Auth 架构内容是否都有 Phase 承接；
- Frontend 后续新增要求是否已进入正确 Phase；
- 哪些仍明确属于独立 Frontend/API/Business Workflow 后续计划；
- 避免 agent 过度扩 scope。

## 4. 执行交接与记录

- [`agent-handoff.md`](./agent-handoff.md) — 稳定执行入口、可直接复制给 coding agent 的完整提示词、多 agent 文件所有权、阶段 Git commit/push 规则。
- [`verification-record.md`](./verification-record.md) — 实际实施期间据实填写的进度、测试、浏览器、失败、恢复、GitHub push 与交接记录模板。

`verification-record.md` 当前没有预填任何测试通过、commit SHA、push 成功或阶段完成结果。

## 5. 参考架构

- [`references/Aisenhub_Platform_Optimization_Architecture.md`](./references/Aisenhub_Platform_Optimization_Architecture.md) — 总体优化架构快照。
- [`references/Aisenhub_Frontend_Experience_State_Architecture.md`](./references/Aisenhub_Frontend_Experience_State_Architecture.md) — Frontend Experience & State 详细架构输入。

研究时产品代码核对基线为：

```text
main@362db831d49308d0e5ca84965af80d86e944f56c
```

后续文档决定核对至：

```text
main@0d42b4cd44a2c17777c33f616bd393c22ee78f16
```

两者之间比较结果只包含文档修改，不代表产品 Auth/UI 已实施。执行 agent 仍必须以本地实际 HEAD/branch/worktree 为准。

## 6. 本包生成状态

本包生成期间：

- 未修改产品仓库代码；
- 未安装依赖；
- 未启动本地服务；
- 未运行产品测试；
- 未执行产品 Git commit/push；
- 未 merge main；
- 未创建 Release；
- 未部署。

## 7. R1 交付说明（2026-09-09）

此目录就是本地计划入口，无需搬移或建立第二份。修订任务 ASU-R1 已把审查意见落实到原文与各阶段 R1 部分；产品任务 ASU-01～05 仍未开始，ASU-V01～16 运行结果 NOT_RUN。

执行前先读 master §2.10、coverage §9 和当前阶段 R1 小节，再按 agent-handoff 开始。完整 Frontend 独立计划已由用户准备，待 Auth 完成后承接；本轮不修改或执行该独立包。

已核对官方依据（2026-09-09，实施时以固定版本再次核实）：[Sign out scope](https://supabase.com/docs/guides/auth/signout)、[Auth logout 默认 global 实现](https://raw.githubusercontent.com/supabase/auth/master/internal/api/logout.go)、[setSession 隐式刷新](https://supabase.com/docs/reference/javascript/auth-setsession)、[Session 生命周期](https://supabase.com/docs/guides/auth/sessions)。这些资料不替代 ASU 本地运行验收。
