# Platform Integration Agent Instructions

本目录是 AI Agent 执行“把目标平台接入 AisenHub”任务时的唯一推荐入口。先遵守目标仓库自己的 `AGENTS.md` / workflow，再执行这里的接入规则。

## 必读顺序

1. `platform-integration/manifest.json`
2. `platform-integration/ai/capabilities.json`
3. `platform-integration/ai/rules.md`
4. `platform-integration/ai/workflow.md`
5. `contracts/account/v1/openapi.json`
6. 目标平台实际需要的 `platform-integration/guides/*.md`

不要通过扫描中央 Admin 页面或 private SQL 来推导 Consumer API。

## 必须先确定

- 目标平台名称 / platform code。
- 目标仓库、分支、当前 commit 与技术栈。
- 中央 commit 与 Account contract major。
- Local/Preview/Production Origin。
- 当前要启用的 capabilities。
- 首个受保护业务接口以及需要校验的 feature。
- 当前授权范围：代码、本地 Supabase、远程环境、生产发布、真实支付。

缺少生产 Secret、平台登记或用户操作时，列为待办；不要要求用户把真实 Secret 粘贴到对话。

## 执行不变量

- Browser → same-origin BFF → Auth/Account API。
- `ACCOUNT_PLATFORM_KEY` 仅服务端。
- access/refresh token 不进入浏览器 JS 可读存储。
- mutation 使用精确 Origin + CSRF。
- BFF 使用 method/path allowlist，不代理任意 URL、host、Admin path、platform_id 或 user_id。
- 上游调用设置有界 deadline，并保留中央 `request_id`。
- Consumer 响应使用 `Cache-Control: no-store` 语义处理敏感账户数据。
- 中央不可用、payload 非法或 entitlement 不确定时 fail closed。
- Idempotency-Key、If-Match、binary body 只按 OpenAPI 明确语义转发。
- 不安装/重新引入 AisenHub Account/Auth runtime SDK，不依赖 `@kit/domain`。
- 不修改账户 Identity/Platform Account 模型来完成普通平台接入。

## 推荐实施顺序

1. Contract baseline。
2. Environment / Origin / Platform Key。
3. Auth session。
4. Principal。
5. Activation。
6. Authorization/Entitlement guard。
7. 一个真实 protected business route。
8. Optional capabilities。
9. Conformance。
10. 目标平台独立验收与接入报告。

## 完成报告至少包含

- 中央 commit / contract major。
- 目标仓库 commit。
- 已实现 capabilities。
- 服务端配置变量名称（不含值）。
- 目标平台实际执行的 typecheck/build/unit/E2E。
- 中央 Conformance 实际执行结果。
- 本地 Supabase / Production 分开记录。
- 未完成项、用户待办、升级与回退说明。

`platform-integration` 的存在不是接入 PASS；只有目标平台实际实现和测试才是证据。
