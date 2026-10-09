# Admin Consumer Lab / Consumer Harness Agent 执行交接

## 项目与计划

- 优化名称：Admin Consumer Lab + Consumer Conformance Harness
- 风险：R3
- 总计划：[plan.md](plan.md)
- 设计：[design.md](design.md)
- 验证记录：[verification-record.md](verification-record.md)
- 工作分支：`codex/admin-consumer-lab-harness`
- 起始依赖：`54acd1bba16500849bb0dabe14727315460ec22f`，来自尚未合入 main 的 `codex/remove-sdk-contract-first`
- 远程：`https://github.com/aisenhub/Aisenhubplatform.git`

## 必读顺序

1. 根 `AGENTS.md`、docs 导航/规则、开发发布流程、platform onboarding。
2. 本 Proposal design/plan/当前 phase/verification-record。
3. canonical contracts、Admin navigation、当前 template-preview、Registry、T16/TASK-0801。

## 执行提示

```text
目标不是把 Reference Consumer 改名成另一个完整应用，而是删除 apps/template-preview。

Admin Consumer Lab 只承担维护者 UI；它不能使用 Admin private helper 证明外部 Consumer 兼容。真正的外部边界证明必须来自 tests/consumer-harness：test-only、非 workspace、无 @kit/*、无 Next/React、无 Domain/Admin import，只能通过标准 Auth HTTP + Account /v1。

先修 canonical contract/checker，再建立 Harness 和 Admin Lab；只有 Harness 真实 Local 闭环通过后才能删除 template-preview。删除测试前先判断断言是在证明公共协议/领域行为还是旧产品 UI；前者必须迁移，后者可删除并在 verification record 说明。

保持 Platform Key server-only、HttpOnly user token、Origin/CSRF、no-store/request_id、ETag/If-Match、binary 有界读取、fail-closed entitlement、跨平台隔离。不要修改 SQL 领域算法或放宽权限来让 Harness 通过。

每阶段运行真实验证、更新 verification record、审查 diff/Secret 后做小提交并 push，远端可达才写已交付。不合并 main、不部署生产、不真实支付。
```

## 串行边界

- Phase 01 的 OpenAPI/checker 是全阶段基础，禁止与其他阶段同时改合同。
- Phase 02/03 可逻辑并行，本次单 Agent 串行。
- Phase 04 删除目录和 E2E/gate 迁移必须最后集成。
- Phase 05 负责 active 文档和最终 R3。

## 阶段完成门槛

- [ ] 本阶段实现与计划一致，必要差异已回写。
- [ ] 必需检查真实执行，失败保留。
- [ ] verification-record 已更新。
- [ ] diff/Secret/workspace hygiene 已检查。
- [ ] 阶段 commit 已 push 且远端可达后才标已交付。
