# 运行拓扑

## 进程与依赖

| 组件 | 入口 | 依赖 |
| --- | --- | --- |
| Admin | apps/admin 的 Next.js server | Supabase Auth、中央 API |
| Account/Admin API | supabase/functions/account-api/index.ts | Auth、PostgreSQL、Storage |
| Maintenance | supabase/functions/maintenance/index.ts | PostgreSQL、Storage、Auth Admin |
| 平台端参考页面 | apps/template-preview | 本地状态；账户页可选 Auth |
| 本地 Supabase | supabase/config.toml | Docker |

[Account API 源码](../../supabase/functions/account-api/index.ts)直接用 Deno 启动时默认端口 8000；[Maintenance](../../supabase/functions/maintenance/index.ts)默认 8001。本地 Supabase API 为 54321，数据库为 54322，Studio 为 54323。Next.js 端口通过启动参数指定。

Account API 可识别 functions/v1/account-api 外层前缀。Maintenance 直接匹配 /maintenance/v1/... 完整路径，外部网关需要传递匹配的路径，不能假定它具备相同的前缀剥离逻辑。

## 服务边界

[Supabase 配置](../../supabase/config.toml)中两个函数的 verify_jwt 均为 false。Account API 自行调用 Auth 验证用户，再按路由验证平台凭据或管理员权限；Maintenance 验证专用 Bearer token。

SQL 连接使用 postgres 驱动、prepare=false 和短事务。Account/Admin 各自最大连接数为 8，Maintenance 为 4；数据库连接变量的选择顺序见[配置](../reference/configuration.md)。

Storage bucket 为私有的 platform-config-files。上传和下载由服务端代理，浏览器没有中央存储写凭据。

## 调度与发布边界

[schedule.json](../../supabase/functions/maintenance/schedule.json)是任务调用元数据；它不安装定时器，也不证明外部调度器已运行。仓库 CI 执行质量检查、构建、单元测试及合同检查，没有生产部署步骤。

备份屏障和墓碑协议在数据库中实现，联合备份脚本位于本地测试目录。仓库没有完整的生产备份调度、独立加密目标配置或自动恢复部署工具。[运维操作](../guides/operations.md)说明已有入口。
