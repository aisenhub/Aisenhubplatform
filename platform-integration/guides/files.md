# Files and Binary Transport

Consumer 文件能力当前主要属于 Config Version 和 Feedback Attachment，不存在要求目标平台复用的通用 Storage SDK。

## Binary BFF

- BFF 允许明确的上传/下载 path。
- 原始 bytes 传输，不做 JSON/text 包装。
- 设置有界 body limit 和 upstream deadline。
- 正确转发合同要求的 content-type、If-Match、Idempotency-Key 等 header。
- 浏览器永远不获得 private Storage credential 或内部 object path 权限。

Storage timeout/unknown outcome 由中央状态机恢复；Consumer 不根据一次 404/timeout 猜测物理对象状态。
