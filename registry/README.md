# 本地 Registry

manifest.json 保存工具链和 SDK 兼容元数据；templates.json 是安装脚本读取的模板清单。它们不是已发布的 npm 或生产 Registry。

SDK tarball 和对应 SHA-256 由 `pnpm sdk:pack` 写入 artifacts/sdk/manifest.json；不要用文档中其他构建的 hash 验证当前产物。

模板清单登记当前参考页面及同源Auth callback，不提供完整Signup/Forgot/Reset流程；实际文件仍以 apps/template-preview/app 为准。包职责见[SDK 与 Registry](../docs/reference/sdk.md)，独立平台安装、环境配置、用户待办及验收见[新平台接入手册](../docs/guides/platform-onboarding.md)。清单和测试脚本不是可直接覆盖新平台的一键安装器。
