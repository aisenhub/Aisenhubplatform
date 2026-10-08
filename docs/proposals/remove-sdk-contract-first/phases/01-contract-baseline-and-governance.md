# Phase 01：Contract Baseline 与治理

状态：验收通过待推送

## 目标

在删除任何 SDK 前先建立无 SDK 架构的公共稳定性来源：根级 canonical OpenAPI、版本/兼容规则、manifest 和 breaking-change 检查。此阶段不改变 `/v1` wire 行为。

## 进入条件与必读

- 工作区已基于最新 `origin/main`，无不明修改。
- 阅读 Proposal、`docs/reference/api.md`、`docs/reference/contracts.md`、`openapi-check.mjs`、`contract-consumer-check.mjs`。

## 实施步骤

1. `git mv` 两个 OpenAPI 到 `contracts/account/v1/openapi.json` 和 `contracts/admin/v1/openapi.json`，不保留复制品。
2. 新建 `contracts/manifest.json`、Account/Admin `COMPATIBILITY.md` 与 `CHANGELOG.md`，冻结 `/v1` backward-compatible、expand-first 和版本规则。
3. 更新 `openapi-check.mjs`、consumer manifest、Admin allowlist test 及 active contract path 引用。
4. 移除“Account operation 必须恰好 22 个”的硬编码；保留 operationId/security/response、binary/no-store、稳定错误码等语义检查。
5. 新增 `contract-breaking-check.mjs` 与 `pnpm contracts:breaking`：默认比较 `origin/main`，兼容本次 base 仍使用旧路径；检测 operation/schema/property/type/enum 删除、required 收紧和 security 变化等明显 breaking change。
6. checker 只读，不访问远程 API、不修改合同。

## 不变量

- OpenAPI 内容语义不因移动而变化。
- `/v1` 现有 operation/security/状态码不删除。
- `packages/domain` 此阶段仍作为内部 DTO 生产者；不删除 SDK。

## 验证

```text
pnpm contracts:check
pnpm contracts:breaking
pnpm --filter admin test:unit
pnpm docs:check
git diff --check
```

## 退出条件

- 旧 OpenAPI 路径不存在，active 引用指向 canonical root contract。
- static + breaking checks PASS。
- Admin allowlist 仍与实际 contract 对齐。
- 无 runtime/package 行为变化。

## 交接

Phase 02 只消费已冻结 `/v1` 合同，不从 `packages/domain` 发明第二套 public schema。
