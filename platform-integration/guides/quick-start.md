# Quick Start

## A. 冻结接入基线

记录中央 commit、Account v1 major、compatibility/changelog revision、目标仓库 commit 和目标环境。

## B. 准备中央平台配置

在 Admin `/admin/platforms/:platformId/settings/integration` 完成：平台 active/allow_activation、当前环境 Origin + callbacks、active Platform Key、Key 部署确认。

商业 Plan/Offer 只有目标平台实际使用付费能力时才需要配置。

## C. 配置目标平台

至少准备语义等价的：

- Consumer Origin
- Account API URL
- Account API timeout
- server-only Platform Key
- Supabase URL
- Supabase publishable key

禁止把 Platform Key 暴露为 public/client env。

## D. 实现最小闭环

1. 登录并建立同源 session。
2. `getPrincipal`。
3. 按需 `activateAccount`。
4. 读取当前 subscription/entitlement。
5. 在目标平台一个真实服务端业务入口中执行 feature guard。

通过后再按 `ai/capabilities.json` 接可选能力。

## E. 验证

中央 Conformance 只提供协议参照；目标平台必须运行自己的构建与 E2E。Production 与 Local 证据分开记录。
