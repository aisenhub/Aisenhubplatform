# Production 发布与 G6 观察

本 Runbook 是 [`development-release-workflow.md`](../development-release-workflow.md) G0–G6 的执行清单，不新增门槛。Production 部署、迁移、Secret/配置写入、真实付款、强制 CSP/HSTS 或真实恢复必须被当前授权明确覆盖。

## G0–G1 候选与本地证据

- 冻结准确 candidate SHA、lockfile、migration 列表/hash、contract major、配置名称差异。
- R0/R1/R2/R3 按工作流执行适用 Local gate；R2/R3 的 Local Supabase 必需项不能用 Hosted 环境代替。
- `pnpm verify:task:0801` 是当前完整 Local gate；若环境阻塞，逐项记录 NOT_RUN/BLOCKED，不能继续宣称完整验收。

## G2–G4 生产只读预检与恢复

- 核对 project ref、域名、Auth callback/origin、Platform Key 版本、DB role、Provider account/mapping、Webhook、Vault/Cron、容量和 feature flags。
- 对迁移执行生产等价旧数据升级/锁预算/forward-fix 演练；空库 reset 不替代升级路径。
- 确认上一个安全应用版本、停止新购买/自动结算开关、数据补偿/积压恢复步骤、告警接收人和数字停止阈值。
- Admin Web 若从 CSP Report-Only 晋升强制 CSP，先保存候选真实 header/console 证据；HSTS 只有确认全站 HTTPS/域名策略后开启。

## G5 执行授权

批准清单必须列出本次具体动作：应用部署、migration、Secret/Key、Provider/价格、Cron/Vault、数据修正、强制 CSP/HSTS、真实付款中的哪些被允许。未列出的高风险动作继续 NOT_RUN。

## 执行顺序

优先 expand/兼容 schema → API/Worker → Admin/Consumer → 验证 → 最后 contract/收缩。支付相关先保持 Checkout/Auto Settlement 关闭，必要时在已批准观察后开启；Webhook/已付款恢复链不得因停止新购买被误关。

## G6 观察

分别记录“部署成功”和“观察完成”。R3 至少观察 Auth/session、跨平台权限、DB错误/锁、Webhook/Job/Grant/Audit、告警与积压；支付没有真实批准订单时写真实交易观察 `NOT_RUN`，不能用空队列替代。错误授予、跨租户、Secret 泄露、账本不一致立即停止相关功能并进入事件处理。
