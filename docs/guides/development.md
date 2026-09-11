# 本地开发

先核对[工具链](../reference/toolchain.md)。在仓库根目录安装锁定依赖：

```powershell
pnpm install --frozen-lockfile --store-dir E:\AppData\pnpm
```

启动平台参考页面：

```powershell
pnpm --filter template-preview dev --port 3001
```

该页面默认使用本地参考状态；账户页的可选 Auth 操作需设置[公开配置](../reference/configuration.md)。

启动管理端：

```powershell
pnpm --filter admin dev --port 3000
```

管理端本地配置可复制 `apps/admin/.env.example` 到 `.env.local`，并使用本地 Supabase 的公开密钥。`ADMIN_ORIGIN` 必须与浏览器地址完全一致；例如访问 `http://127.0.0.1:3000/admin` 时就不能配置成 `http://localhost:3101`。只有页面启动，不代表中央 API 与数据库同时启动。

## 后端本地依赖

Docker 可用时，pnpm db:start 启动根 supabase 配置，pnpm db:stop 停止服务。pnpm db:reset 会重建本地数据库并执行迁移，会清除本地数据库内容；只在准备重置本地环境时使用。脚本拒绝远程 SUPABASE_URL、NEXT_PUBLIC_SITE_URL 或已设置 SUPABASE_PROJECT_REF 的环境。

中央 API 与 Maintenance 可用 Deno 直接运行对应 index.ts；先注入[配置](../reference/configuration.md)，并给予 env、net、read 和 import 权限。它们不由 Next.js dev 自动启动。

## 检查与构建

```powershell
pnpm docs:check
pnpm contracts:check
pnpm lint
pnpm typecheck
pnpm build
```

typecheck 和 build 的前置步骤会重新打包 SDK。build 使用 Next.js webpack，不执行生产部署。测试分类及运行限制见[测试指南](testing.md)。
