# G0-L Local 开发门槛

日期：2026-09-08  
状态：PASS（Local）

- 固定项目 CLI、Local Supabase 启动/迁移与 pgTAP：PASS（8 文件、152 tests）。
- Node/Deno 双运行时、单元测试、lint、typecheck、contracts、docs 与构建：本轮 T04 前已实际通过；本轮改动另以 Deno Account API 6 tests、共享 Auth adapter 4 tests 和真实 Local API 探针复核。
- `SP-AUTH`：密码、refresh、TOTP AAL2、中央近期 proof、Auth logout 与旧 JWT 调用受保护 API 的拒绝均 PASS。
- 不纳入本门槛：Staging/生产、Google/SMTP、真实浏览器 SSR；均为 NOT_RUN，转入 G0-S/T17。

工具缓存按项目规则使用 `E:\AppData\pnpm` 与 `E:\AppData\deno\cache`；未写入 Staging。
