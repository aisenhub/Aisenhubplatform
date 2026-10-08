# Account API v1 兼容策略

`/v1` 是 AisenHub Account API 的 wire-compatibility 边界。`openapi.json` 是唯一机器可读公共合同，`info.version` 记录该合同在 `/v1` 内的修订版本。

允许在 `/v1` 内进行兼容扩展：新增 endpoint、新增 optional request 输入、新增 response 字段、补充非破坏性错误/描述。禁止直接删除或改名既有 operation/公共字段、改变既有字段类型或业务语义、把 optional request 输入改成 required、删除既有 enum 值或收紧既有 operation 的 security。无法通过 expand-first 完成的变化必须重新设计或进入 `/v2`。

公共字段演进采用 expand → migrate → contract；`/v1` 默认只执行 expand/migrate。Consumer 必须把未知 response 字段视为可忽略扩展，对文档明确允许扩展的状态值提供 unknown fallback。

AisenHubPlatform 保证 HTTP wire compatibility，不保证由任意 OpenAPI generator 生成的客户端源码兼容。Consumer 自己拥有 integration adapter 和生成代码，并记录其最近验收的 contract revision。
