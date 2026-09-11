# 工具链

| 项目 | 仓库定义 |
| --- | --- |
| Node | 根 engines >=22.13.0；CI 固定 24.19.0 |
| pnpm | packageManager 与 CI 固定 11.18.0 |
| Next.js | workspace catalog 16.3.0 |
| React / React DOM | workspace catalog 19.2.8 |
| TypeScript | workspace catalog 7.0.2 |
| Supabase CLI | 根依赖 2.111.0 |
| Supabase JS | workspace catalog 2.111.0 |
| Deno | CI 固定 2.9.6 |
| postgres | 3.4.3 |

声明与锁定依赖分别见 [package.json](../../package.json)、[pnpm-workspace.yaml](../../pnpm-workspace.yaml)和[pnpm-lock.yaml](../../pnpm-lock.yaml)，CI 配置见[workflow.yml](../../.github/workflows/workflow.yml)。版本表描述仓库定义，不代表本机 PATH 自动匹配。

工具优先复用。新增可自定义安装的软件放在 D:\APP\Codex 下对应工具子目录；工具缓存放在 E:\AppData 下对应工具子目录。项目依赖保留在项目约定目录，不主动使用 C 盘默认安装。

上游归属与许可证以 [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES)和[LICENSE](../../LICENSE)为准。
