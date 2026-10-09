# Phase 04：迁移 Consumer E2E 并删除 `apps/template-preview`

状态：已交付

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

把真实 Consumer Local 验收从完整 Next.js Reference Consumer 迁到极薄 Harness，随后删除 `apps/template-preview` 及所有 active 构建/Registry/gate 依赖。

## 进入条件

- Phase 02 Harness static boundary PASS。
- Phase 03 Admin Lab typecheck/build/unit PASS。
- 旧 template-preview 仍存在，可在迁移 E2E 失败时回退。

## E2E 迁移

1. 将 T16 Consumer 部分改为启动两个 `tests/consumer-harness/server.mjs` 实例，分别注入 platform A/B key 和 origin。
2. 保留真实 fixture：两平台/两 key、同一普通用户、redemption、file policy、Storage、Admin fixture。
3. Consumer 断言保留/新增：HTML/JS 无 Platform Key/token marker；login session cookie HttpOnly；两个 browser context session 独立；wrong Origin/CSRF mutation 拒绝；principal/activate 绑定正确 platform；A key 不能构造 B principal；suspend 后 Consumer route 403；subscription read/redeem；profile/preferences ETag/If-Match；file intent → binary PUT → list/download/delete；logout 后 protected request 401；invalid refresh fail closed。
4. 删除只证明旧产品 UI 的断言：订阅卡价格文案、完整账户表单 UX、多 Tab BroadcastChannel、Reference Consumer bundle/导航品牌等。
5. recent-auth 中央 proof 继续由 `test:api:t12-ordinary-proof`；Admin MFA/页面继续由 `test:e2e:t12-r2` 和 Admin unit/E2E。
6. 新脚本命名 `test:e2e:consumer-harness`；`test:e2e` 指向新脚本。旧 T16 文件优先重命名，避免 active 名称继续暗示 template 产品。

## 删除与元数据

- 删除 `apps/template-preview/**`。
- 更新 lockfile/workspace；root typecheck/build 不再识别 template-preview。
- Registry manifest 升级为 Consumer Lab + Harness metadata；删除 `registry/templates.json` 及模板 route inventory test。
- `test:registry` 验证 canonical contract、Admin Lab path、Harness path、Secret boundary。
- `test:reference-consumer` 删除，替换为 `test:consumer-harness`。
- `tooling/scripts/src/task-0801.mjs` 删除 template typecheck/reference probe，加入 Harness static + new E2E。
- `docs/reference/contract-consumers.json` 中 Consumer owner 从 Reference Consumer UI/BFF 改成 Harness/API test 或实际外部边界；不能只换字符串让静态检查绿。

## 验证

```text
pnpm install --lockfile-only --store-dir E:/AppData/pnpm
pnpm test:consumer-harness
pnpm test:registry
pnpm contracts:check
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:e2e:consumer-harness
git grep -n "template-preview" -- ':!docs/archive/**' ':!docs/reviews/**' ':!docs/proposals/**'
git diff --check
```

`git grep` 的 active docs 命中在 Phase 05 收敛；历史 proposal 可保留真实过去事实。

## 失败恢复

- Harness E2E 未达到旧高价值领域覆盖前不删除 template-preview。
- 删除后出现构建/fixture 回归时优先 revert 本阶段，不改 SQL/业务数据来迁就测试。

## 退出条件

- `apps/template-preview` 不存在。
- root build/typecheck/unit 与新 Harness/Registry/E2E PASS。
- TASK-0801 已切到新 gate，但完整 R3 由 Phase 05 最终候选执行。
