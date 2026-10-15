# Consumer 接入与 HTTP 合同需求

## REQ-API-001 — OpenAPI 是公开 Wire Contract 权威

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Compatibility
- **Architecture**: `architecture/modules/consumer-api-integration.md`

**Statement**

Account/Admin 公共 HTTP method/path/schema/status/header 必须以 canonical OpenAPI 为唯一机器可读合同，不得维护第二套不一致 schema。

## REQ-API-002 — Consumer 不依赖中央私有 Runtime SDK

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Compatibility

**Statement**

目标 Consumer 必须能够仅通过标准 HTTP、OpenAPI、Platform Integration 文档和 conformance 实现接入，不要求安装 `@kit/domain` 或中央 Auth runtime package。

## REQ-API-003 — Platform Key 只能存在于 Consumer 服务端

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Consumer Browser 必须经自身 same-origin BFF 调用中央 API；Platform Key 不进入 JS/HTML/URL/localStorage/公开日志。

## REQ-API-004 — HTTP 成功/错误必须有稳定机器语义

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Compatibility

**Statement**

JSON API 必须提供稳定 request ID 与 machine-readable error code；Consumer 逻辑不得解析本地化 message 判断业务结果。

## REQ-API-005 — Retry 必须遵循操作语义

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

安全读可在有界预算内恢复；mutation 默认不自动 replay，只有合同明确幂等且保持相同 key/body 时才可恢复；binary upload 失败先读取服务端状态。

## REQ-API-006 — 请求体必须有真实 Byte/Time Budget

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

中央 API/BFF 必须在读取过程中限制 JSON/binary payload 的实际字节与时间，不得无限读取完整 body 后才检查大小。

## REQ-API-007 — Platform Integration 必须映射 Capability 到合同与验证

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Compatibility

**Statement**

每个公开集成 capability 必须能够追踪到 operationId、文档和 conformance；Integration Package 只引用 canonical OpenAPI，不复制第二份 schema。

## REQ-API-008 — 独立 Consumer Harness 必须证明无私有包依赖

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Compatibility

**Statement**

项目必须维护一个不依赖 `@kit/*` runtime 的独立 Consumer Harness，用真实 HTTP/Auth/DB/Storage Local E2E 验证公开协议可由外部 Consumer 实现。

## REQ-API-009 — Contract Major 内遵循兼容演进

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Compatibility

**Statement**

`/v1` baseline 内必须遵循 expand -> migrate -> contract；删除/改名 operation、收窄类型/enum、增加既有请求 required input 或改变既有安全语义属于破坏性变更并需要检测/升级策略。

## REQ-API-010 — Consumer 不复制中央领域算法

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Consumer 不得成为 Entitlement、Commerce、Storage quota、Redemption、Billing、Identity lifecycle、Admin MFA 或跨租户 ownership 的第二事实源；UI 可定制，但业务授权和数值来自中央合同。

## REQ-API-011 — 验证证据必须标明层级

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Constraint

**Statement**

兼容/接入结论必须说明证据层级是 static、unit、Local E2E、Hosted 还是 Production；Conformance PASS 不得被扩大解释为目标平台已经生产接入完成。

**Acceptance**

- `platform-integration/manifest.json` 明确 `runtime_sdk=false` 并只指向 canonical Account OpenAPI。
- capability index 当前 11 项，能够映射 guide/conformance，适用能力映射 canonical operationId。
- Consumer Harness 保持 test-only、非 workspace 产品应用、不依赖 `@kit/*` runtime/Next/React/Admin private 实现。
- breaking checker 至少覆盖 required-request 收紧、参数/响应/enum 删除和 security 变化，并允许已证明兼容的 additive 变化。
- 不存在的历史 Admin Consumer Lab 不作为当前 conformance 或 readiness 证据。

## Domain Verification

当前基线由 `platform-integration/validate.mjs`、`tests/consumer-harness`、contract breaking comparator tests、`contracts:check` 与 Local Consumer Harness E2E 组成。Harness 默认 5 秒上游预算与 64 KiB JSON / 1 MiB binary 限制属于该 fixture 的可执行边界，不代表所有生产 Consumer 的统一 SLA。
