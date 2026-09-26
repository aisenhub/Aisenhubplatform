# 阶段 01：操作员安全语义

状态：进行中（`SEC-ADMIN-02` 本地验证完成，R3 CI/Git 交付尚未完成）

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

先消除 Admin 客户端对认证、MFA、管理员身份和服务故障的错误解释，再建立服务端权威状态入口。阶段内仍按 `SEC-ADMIN-01`、`SEC-ADMIN-02` 两个任务顺序独立派发。

## 进入条件

- 用户明确派发其中一个任务 ID。
- 当前工作区和分支归属已核对。
- 已阅读身份安全、前端架构、API 合同、平台接入和开发发布流程。
- `SEC-ADMIN-02` 开始前，`SEC-ADMIN-01` 已完成本地验收且合同稳定；Git 交付待处理时由用户明确允许继续。

## 已核实调用链

- 共享错误工具：`apps/admin/features/resources/admin-resource-utils.ts`
- Billing 局部 MFA 判断：`apps/admin/features/billing/central-billing-page.tsx`
- Shell：`apps/admin/components/shell/admin-shell.tsx`
- 浏览器 BFF：`apps/admin/app/api/v1/[...path]/route.ts`
- Admin API：`supabase/functions/account-api/admin.ts`
- Account API 入口和错误响应：`supabase/functions/account-api/index.ts`
- Admin OpenAPI、相关共享类型和现有 Admin/Auth 测试。

执行 Agent 必须重新搜索全部 401、403、`MFA_REQUIRED`、`RECENT_MFA_REQUIRED`、`ADMIN_REQUIRED` 调用方，不能把以上列表视为完整结果。

## 任务清单

### `SEC-ADMIN-01`

- [ ] 为共享分类器保留/新增当前错误行为的失败用例。
- [ ] 建立唯一的错误码优先分类；HTTP status 只作为错误码缺失时的退化信息。
- [ ] 删除 Billing、Audit、Security、Platform 页面中互相冲突的局部分支。
- [ ] `MFA_REQUIRED` 显示完整 MFA 指引，不打开近期验证面板；统一跳转随 `SEC-ADMIN-02` 的 Shell Gate 完成。
- [ ] 验证安全 returnTo，拒绝外部 URL。
- [ ] Step-up 成功只恢复 UI，不自动提交原 mutation。
- [ ] 覆盖 loading、错误、重试、取消和重复点击。

详细范围和验收以总计划 `SEC-ADMIN-01` 任务卡为准。

### `SEC-ADMIN-02`

- [x] 冻结最小 status 合同：匿名 401，非管理员 403 `ADMIN_REQUIRED`，管理员 200 `{ current_aal, recent_mfa_expires_at }`；因子数复用现有 factor 列表。
- [x] 在全局 AAL2 gate 前经过身份、session 和管理员校验后返回 status；AAL1 管理员可读取该状态。
- [x] BFF 只做同源 Cookie/请求转发，不复制状态算法。
- [x] Shell 在状态完成前不渲染敏感业务数据。
- [x] 将 status 结果映射到登录、MFA、非管理员、AAL2 可读和服务故障界面；近期 proof 仍由敏感动作响应驱动 Step-up。
- [x] 覆盖撤销 session、匿名访问与上游不可用/重试。

详细范围和验收以总计划 `SEC-ADMIN-02` 任务卡为准。

## 不变量与禁止项

- 单管理员事实只由服务端判断。
- AAL2 不代表 session 一定仍有效。
- recent-proof 不由客户端倒计时决定。
- 不增加 RBAC、能力列表、第二套数据请求层或状态管理库。
- 不通过隐藏菜单代替服务端授权。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| Admin 单测 | `pnpm --filter admin test:unit` | Local | 分类器、状态映射和调用方通过 | PASS：17 用例 |
| Auth 单测 | `pnpm --filter @kit/account-auth-nextjs test:unit` | Local | Session/MFA 适配通过 | 未运行 |
| API 单测 | `pnpm exec deno test --allow-env supabase/functions/account-api/index.test.ts` | Local | 状态组合与错误码通过 | PASS：40 用例，包括管理员、非管理员、撤销 session 和 malformed SQL 结果 |
| SQL 权限与角色 | `pnpm exec supabase test db --local supabase/tests/sec_admin_02_security_status.sql` | Local Supabase | Admin executor 授权、其他 runtime 拒绝、SECURITY DEFINER、活动 session 与撤销 session | PASS：7 个 pgTAP 断言；以 `admin_executor` 验证 `admin_required`、AAL1 active 状态及 revoked session 拒绝 |
| 合同 | `pnpm contracts:check` | Local | OpenAPI/消费者一致 | PASS：Admin 45 operations；status OpenAPI 已同步 |
| 本地数据库准备 | `pnpm exec supabase migration up --local` | Local Supabase | 前向应用待迁移，不重置数据库 | PASS：应用 20260921084727 与 20260926104028；未执行 `db:reset` |
| E2E | `pnpm test:e2e:t12-r2` | Local browser + Supabase | 登录、Shell Gate、失败恢复、登出后匿名重定向及布局语义通过 | PASS：AAL1/AAL2、非管理员阻断、status 503 fail-closed/重试、recent proof 显式重提、敏感写入、登出后旧 JWT 拒绝；70 个路由/视口组合通过 |
| 质量 | `pnpm format:check`、`pnpm lint`、`pnpm --filter admin typecheck` | Local | 格式、静态规则和类型检查无新增错误 | PASS |

## 退出与恢复条件

- 两个任务分别满足总计划验收并更新验证记录。
- 旧页面局部 403/MFA 判断已退出。
- 状态端点和 Shell 具有兼容回退顺序。
- 若普通用户、AAL1 或撤销 session 任何一项未验证，本阶段不得交付。
- 回退顺序：先 UI/Shell 消费，再兼容 BFF/API；无数据删除。
