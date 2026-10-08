# Remove SDK / Contract-First Agent 执行交接

## 项目与计划

- 优化名称：移除 Consumer SDK 与 Contract-First 接入
- 总计划：[plan.md](plan.md)
- 设计：[design.md](design.md)
- 当前工作分支：`codex/remove-sdk-contract-first`
- 远程仓库：`https://github.com/aisenhub/Aisenhubplatform.git`
- 风险级别：R3

## 必读顺序

1. 根 `AGENTS.md`、`docs/README.md`、`docs/agents.md`、开发发布流程。
2. 本 Proposal 的 design/plan/当前 phase/verification-record。
3. API/contracts/platform-onboarding 与当前阶段源码测试。

## 执行提示词

```text
你正在实施 remove-sdk-contract-first Proposal。
只执行当前已满足前置条件的阶段。保持 /v1 wire contract、PostgreSQL private 领域过程、Platform Key server-only、Origin/CSRF、MFA/recent-auth、no-store、request_id 和 fail-closed 授权不退化。

本优化不是把 SDK 机械改名成另一个公共包：Reference Consumer 与 Admin 可以拥有 app-local Auth/integration 代码，但不得重新创建 Consumer runtime SDK。packages/domain 保留为中央内部模块；Reference Consumer 必须退出其依赖。

按 Phase 01→06 顺序实施。Phase 04 删除 SDK 前必须证明运行消费者已迁移。保留安全负例，不得扩大 allowlist、减少断言、关闭鉴权或删除失败测试。

阶段完成后运行真实验证并更新 verification-record.md。生产部署、真实支付、费用/Secret/数据操作不在本任务授权内。main 自动合并必须额外确认不会未经授权触发生产；绑定未知时停在任务分支 push。
```

## 文件所有权和串行边界

- Canonical OpenAPI、root scripts、Reference Consumer、Admin Auth、Registry/总 gate 属于本 Proposal，按 phase 串行修改。
- `packages/domain` 不是待删除 SDK，不把内部领域算法复制到 Consumer。
- 历史 archive/review/verification 不改写真实过去结果。

## 阶段完成门槛

- [ ] 本阶段范围实施且没有未说明行为差异。
- [ ] 必需测试实际运行并记录真实结果。
- [ ] architecture/reference/guides 按阶段需要同步。
- [ ] diff/敏感信息检查完成。
- [ ] 阶段 commit 已 push 且远端核对。
