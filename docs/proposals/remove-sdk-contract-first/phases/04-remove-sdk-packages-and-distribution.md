# Phase 04：删除 SDK Package 与发行链

状态：验收通过待推送

## 目标

在所有运行消费者已迁移后，删除 Consumer SDK/适配 packages、tarball/manifest、安装测试和构建前置。

## 前置条件

- Phase 03 退出条件全部满足。
- `git grep` 证明 app/runtime 不再 import 三个 package。

## 实施步骤

1. 删除 `packages/account-auth/`、`packages/account-auth-nextjs/`、`packages/account-server/`。
2. 删除 `sdk-pack.mjs`、`sdk-output.mjs`、其测试和 `tests/spikes/sdk/m5-02-packages.mjs`；退出 tarball consumer install 旧实现。
3. Root `package.json` 删除 `prebuild`/`pretypecheck` SDK pack、`sdk:pack`、`test:sdk:*`、旧 consumer install script。
4. `apps/admin/vercel.json` 删除 SDK pack 前置。
5. `registry/manifest.json` 删除 `sdk_compatibility`，改为 `contract_compatibility`；README 同步。
6. 更新 lockfile，不保留 orphan workspace dependency。
7. `packages/domain` 保留 central-internal，不向 Consumer 发布。

## 验证

```text
pnpm install --lockfile-only --store-dir E:/AppData/pnpm
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:tooling
pnpm runtime:probe
git diff --check
```

历史 review/archive/verification 可继续出现过去 package 名，不机械改写历史。

## 退出条件

- package/tooling/test 发行链删除。
- build/typecheck 不生成 SDK artifacts。
- workspace typecheck/build/unit 通过。
- Registry 不描述 SDK compatibility。
