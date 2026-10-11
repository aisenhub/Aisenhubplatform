# Phase 01 — Feedback 领域与 Storage 基础

状态：已完成

## 目标

建立 Feedback/Attachment 独立数据模型、专用 private bucket、领域 SQL 状态机、权限与 pgTAP；不改变 Config file ledger。

## 修改范围

- `supabase/migrations/20261011124445_feedback_domain_storage.sql`：Feedback/Attachment/Label/Event 与 private bucket。
- `supabase/migrations/20261011124739_feedback_domain_functions.sql`：Account primitives、write-attempt/unknown、privacy/delete 与 cleanup primitives。
- `supabase/migrations/20261011140102_feedback_domain_fk_indexes.sql`：Advisor 指出的 Feedback FK covering indexes。
- `supabase/tests/t27_feedback_domain.sql`。
- `supabase/functions/_shared/storage.ts` + test：bucket 类型收敛为受控 union。
- Proposal verification record。

## 实施步骤

1. 创建 `platform-feedback-attachments` private bucket，4 MiB，JPEG/PNG/WebP；不创建浏览器直连 policy。
2. 新建 Feedback、Attachment、Labels、Events；public 表 enable + force RLS，运行角色无直接 DML。
3. 建立 account primitives：create/read/list/patch、attachment intent/claim/prepare/finalize/cancel、submit。
4. 建立后续阶段需要的 delete/reconcile/privacy helper 与 attachment cleanup candidate/claim/finish，不先暴露 HTTP。
5. 建立 platform/date/status/category/author/cleanup/FK covering indexes。
6. Storage adapter bucket 改成 `'platform-config-files' | 'platform-feedback-attachments'`，现有 Config 行为不变。

## 不变量

- draft 之外 Consumer 不可修改正文/附件集合。
- submit 要求全部附件 active；unknown/receiving/storing 不可提交。
- 最多 5 张、单张 4 MiB、总计 12 MiB，由 DB 重复保证。
- attachment path 永不复用；unknown 不推断不存在。
- deleting 立即最小化业务数据；物理对象仍由 cleanup 证明。
- account/admin/job executor 只有明确领域函数 EXECUTE，无基础表 DML。

## 验证

- `pnpm toolchain:check`
- targeted `t27_feedback_domain.sql`
- `pnpm test:db`
- fresh `supabase db reset --local --no-seed` + DB tests
- 从 OPT-007 final migration + 合成旧数据执行 non-empty upgrade + DB tests
- Storage adapter Deno tests
- Supabase Advisors

## 退出条件

schema/domain/storage adapter/权限测试 PASS；旧 Config/legacy file pgTAP 全绿；fresh/upgrade 可重复；Local Security Advisor 0 issues，Feedback FK Advisor 缺口为 0。checkpoint commit/push 后进入 Phase 02。
