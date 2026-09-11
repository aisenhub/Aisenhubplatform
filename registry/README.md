# 本地 Registry

manifest.json 保存工具链和 SDK 兼容元数据；templates.json 是安装脚本读取的模板清单。它们不是已发布的 npm 或生产 Registry。

SDK tarball 和对应 SHA-256 由 `pnpm sdk:pack` 写入 artifacts/sdk/manifest.json；不要用文档中其他构建的 hash 验证当前产物。

模板清单包含当前参考应用不存在的登录路由，实际页面以 apps/template-preview/app 为准。使用方法与边界见 [SDK 与 Registry](../docs/reference/sdk.md)。
