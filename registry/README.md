# 本地 Registry

manifest.json 保存工具链和 HTTP contract 兼容元数据；templates.json 是参考模板清单。它们不是已发布的 npm 或生产 Registry。

Account/Admin 的公共集成边界以根目录 `contracts/*/v1/openapi.json` 为准；Registry 只记录 Reference Consumer 当前验收的 contract major，不分发 Account runtime package。

模板清单登记当前参考页面及同源 Auth callback，不提供完整 Signup/Forgot/Reset 流程；实际文件仍以 apps/template-preview/app 为准。独立平台接入、环境配置、用户待办及验收见[新平台接入手册](../docs/guides/platform-onboarding.md)。清单和测试脚本不是可直接覆盖新平台的一键安装器。
