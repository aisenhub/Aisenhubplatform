# OPT-006 Agent 执行交接

## 项目

- 项目：`E:\Projects\Aisenhubplatform`
- 任务：OPT-006 平台接入配置与首次接入向导
- 起始 main：`018bcaf78797391b9b9080c5cb4be81150d86925`
- 当前分支：`codex/opt-006-platform-onboarding`
- 风险：R3
- 当前阶段：[Phase 01](phases/01-integration-state-navigation.md)

## 冻结结论

- 不新增 `integration complete` 数据字段；进度来自现有权威事实的纯投影。
- 中央自动进度只计算平台策略、active Origin/回调、active Key、Key 部署确认四项。
- 商业配置按需，不作为所有平台接入阻塞项。
- 目标平台 Auth/BFF/protected route 与独立 E2E 只能标“需外部验证”，禁止手工勾 PASS。
- Origin/Key mutation 只能复用现有实现，不能在新页面复制安全逻辑。
- 旧 `/settings/origins` 与 `/settings/keys` 保留兼容；Sidebar 只显示 `/settings/integration`。
- 本项不新增 migration/API/OpenAPI，因此没有 staging Supabase 部署动作。

## 完成门槛

- [ ] 两个 phase 完成。
- [ ] Local R3/canonical gate 无 FAIL/BLOCKED。
- [ ] main/远端/分支状态闭环。
