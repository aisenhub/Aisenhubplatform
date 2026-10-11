# Phase 02 — Account v1 与 Consumer Conformance

状态：未开始

## 目标

用 additive Account v1 API 暴露“我的配置 + 配置广场”，并复用既有 private Storage 内容流，不破坏六个 legacy config-files operation。

## 实施项

- [ ] API-001：Account API 增加 `/v1/configs` CRUD、versions list/upload-intent/content、gallery submission；metadata mutation 使用 ETag/If-Match 或幂等键。
- [ ] API-002：增加 `/v1/config-gallery` list/detail/like/content/apply；只解析 approved Entry 的 published Version。
- [ ] STORAGE-001：Version content PUT/GET 与 Gallery download/apply 复用现有 Storage service、write attempt/finalize、no-store、binary 安全与 request_id；不发 signed/public URL。
- [ ] EVENT-001：download 在 stream completed 后写 `download_completed`；apply 以 Idempotency-Key 去重写 `apply_delivery_completed`，文案不宣称业务应用成功。
- [ ] CONTRACT-001：Account OpenAPI additive 定义 DTO/error/ETag/Idempotency/二进制响应；运行 `contracts:check` 与 `contracts:breaking`。
- [ ] HARNESS-001：Consumer Harness canonical allowlist 加入新 API，验证 server-only Platform Key、Origin/CSRF（mutation）、deadline/no-store/binary、跨平台拒绝与 legacy 兼容。
- [ ] E2E-001：Local Consumer Harness 真实创建 Config、上传 Version、提交审核前私有、批准 fixture 后 Gallery 下载/Like/Apply；不得用 Mock 冒充 Storage。
- [ ] STAGE-001：部署 Account API 到授权 staging，执行真实 HTTP smoke 与函数权限/版本核对；Production NOT_RUN。

## 完成门槛

- 新 API 只做 v1 additive 扩展。
- 浏览器不持有 Platform Key/Storage credential；binary 无 text 转码。
- Gallery removed/blocked、作者关闭、Version/file 非 active 时全部 fail closed。
- staging Account API 与当前 commit 同步后才进入 Phase 03。
