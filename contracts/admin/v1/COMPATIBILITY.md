# Admin API v1 兼容策略

`/admin/api/v1` 是 AisenHub Admin API 的 wire-compatibility 边界。`openapi.json` 是唯一机器可读公共合同，`info.version` 记录同一 major 下的修订版本。

允许兼容扩展；禁止删除或改名既有 operation/字段、改变字段类型/语义、增加既有调用必须提供的 required request 输入、删除既有 enum 值或静默收紧 security。Admin 的 AAL2、近期 MFA、If-Match、operation_id、reason 等安全边界只能通过显式兼容迁移改变，不能靠 UI/BFF 参数绕过。

AisenHubPlatform 保证 wire compatibility，不保证任何生成客户端的源码兼容。无法兼容的变化进入新的 API major。
