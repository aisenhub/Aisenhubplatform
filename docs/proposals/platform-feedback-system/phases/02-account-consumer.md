# Phase 02 — Account API 与 Consumer Feedback

状态：未开始

## 目标

把 Phase 01 领域能力作为 additive Account v1 HTTP contract 暴露给独立 Consumer，并完成真实 Local Auth/API/Storage/Browser conformance。

## 修改范围

- `supabase/functions/account-api/feedback.ts`、account/index/core/files 适用部分。
- `contracts/account/v1/openapi.json`、compatibility/changelog、stable errors/DTO（适用时）。
- `tests/consumer-harness` 与 `tests/spikes/e2e/consumer-harness-local.mjs`。
- onboarding 与 Consumer Lab generated summary。

## HTTP 行为

实现 design 中 8 个 operations。create/upload-intent 使用 Idempotency-Key；PATCH 用 If-Match；content PUT 有界读取并验证 magic/真实大小；submit 从当前 Auth bearer 服务端读取 email。跨账户/平台统一 404，响应 no-store，错误不泄露正文/邮箱/Storage path。

## 验证

- Account API Deno tests：Auth email spoof、Idempotency、If-Match、非法 MIME/超限、unknown write。
- `pnpm contracts:check`、`pnpm contracts:breaking`。
- Consumer Harness static/process。
- Local Consumer E2E：text-only、3 images、SVG 拒绝、size mismatch、跨平台 IDOR、未完成附件 submit 拒绝、提交成功、own history。
- typecheck/lint/format/docs。

## 退出条件

Account contract、HTTP 与 Harness 一致，Local conformance 全绿，阶段 commit/push/远端核对完成。
