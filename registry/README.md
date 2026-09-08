# Aisenhub Registry（Local preview）

这里是 M5-04 的本地 Registry 元数据，不是 npm/正式 Registry，也不包含发布凭据或 tarball。`manifest.json` 固定模板源、Node/pnpm/Next 版本和 SDK 兼容范围；SDK tarball 的实际 SHA-256 记录在 `docs/development/evidence/M5-02.md`。

模板只复制页面、同源 BFF 路由和 SDK glue，不复制 Supabase service key、领域函数、权益/配额/日期计算或 Storage 删除算法。配置由部署环境注入；浏览器端不读取 server-only platform key。

当前可验证命令：

```text
pnpm run test:registry:m5-04
pnpm --filter template-preview typecheck
pnpm --filter template-preview test:unit
pnpm --filter template-preview build
```

正式 scope、Registry host、发布地址和凭据属于 X05；在授权到位前只能记录 Local 结果，不能声称可从 npm 获取。
