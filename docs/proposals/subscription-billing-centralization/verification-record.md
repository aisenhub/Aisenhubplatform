# 实施与验证记录

> BILL-01～BILL-03 已记录本地 G-DEV 结果；真实 Provider、运维和生产证据仍保持独立状态。

## 1. 执行基线

- 架构：[唯一设计](AisenFlow_Subscription_Billing_Architecture.md)；本阶段实施基线 HEAD：`fdd106f`。
- 计划：[总计划](00-master-plan.md)；本阶段实施基线 HEAD：`fdd106f`。
- 工作目录/branch/HEAD/remote：`E:\Projects\Aisenhubplatform` / `codex/billing-architecture-review` / `2d058a4` / `origin=https://github.com/aisenhub/Aisenhubplatform.git`；开始前工作区 clean。
- Node `v24.19.0`、pnpm `11.18.0`、Supabase CLI `2.111.0`、Deno `2.9.6`；Local DB reset、Docker 数据库和迁移测试已验证；调度与生产观察未验证。
- 基线：`pnpm docs:check` PASS；`pnpm contracts:check` PASS；`pnpm runtime:probe` PASS；`pnpm typecheck` PASS；`pnpm format:check` FAIL（既有54个文件）；`pnpm lint` FAIL（既有 `apps/template-preview/app/subscription/page.tsx:64` 未使用变量）；`pnpm test:api` 未运行且为占位入口。
- 当前用户实际派发阶段与授权范围：按 proposal 完成 BILL-01～BILL-07；当前仅本地合同、数据库、API、SDK 与管理界面实现，不含真实付款、Provider/Webhook 配置、生产迁移或部署。
- 历史研究d3c25e9不是执行起点；本轮文档修订不作为任何功能验证。

## 2. 阶段状态

| 阶段 | 状态 | 实现/剩余 | commit/push |
|---|---|---|---|
| BILL-01 | G-DEV 已完成 | Provider-neutral 合同、虚构适配器夹具、Node/Deno MD5/HMAC 向量已验证；G-PROVIDER 未运行 | `20a28ed` / `4abb87b`，已 push |
| BILL-02 | 本地验收已交付 | 固定商品目录、期限语义、平台商品配置、切换 preflight、Account API/SDK/OpenAPI/Admin UI 已实现；Provider 映射未配置，真实购买关闭 | `503f14c` / `fdd106f`，已 push |
| BILL-03 | 本地验收通过待提交 | Redemption V2 快照、历史兼容、统一码规范化、Admin correction 预览/原子替代链、Admin/API 接入已实现；真实结算未运行 | 当前工作区待提交；验证通过后记录 commit |
| BILL-04 | 未开始 | 全部 | 未记录 |
| BILL-05 | 未开始 | 全部 | 未记录 |
| BILL-06 | 未开始 | 全部 | 未记录 |
| BILL-07 | 未开始 | 全部 | 未记录 |

状态可用未开始/进行中/已阻塞/验证失败/验收通过待推送/已交付。已交付仅指该阶段明确范围，真实渠道和运维门槛另列；整体未满足不能Completed。

## 3. 门槛与协议证据

| 门槛 | 状态 | 证据/缺口 |
|---|---|---|
| G-DEV | PASS | `packages/domain/src/contracts/billing.ts` 冻结四商品期限、金额字符串、Checkout snapshot、Provider snapshot、操作版本和结算状态；BILL-02 增加固定商品目录、平台配置、切换 preflight、OpenAPI/SDK/Admin UI；BILL-03 增加 Redemption V2 snapshot、码规范化和 correction 链；虚构 Provider adapter fixture；Node/Deno 固定向量均通过 |
| G-PROVIDER | NOT_RUN | 真实渠道未验证 |
| G-OPS | NOT_RUN | 调度/恢复/开关未验证 |

| 协议项目 | 官方来源/日期/版本 | 脱敏操作与结果 | 状态 |
|---|---|---|---|
| custom_order_id传递/长度/query回显 | [官方开发者文档](https://guide.afdian.com/creator/developer)（2026-09-11；公开页未出现该字段） | 用户脱敏样例也未出现；不得自动绑定 | NOT_RUN |
| 重复链接/调价/撤销能力 | 官方公开页未覆盖 | 未执行真实 Checkout | NOT_RUN |
| plan/type/SKU/count/month/currency | 官方公开页记录 `plan_id`、`month`、`product_type`、`sku_detail`、金额字段；未冻结当前商品映射 | 仅本地 DTO/fixture；无真实商品查询 | NOT_RUN |
| 签名原文/可信公钥/query权威 | 官方公开页记录 MD5(token+排序后的 key/value)，并给出请求时间窗口示例；无公钥合同 | MD5/HMAC 本地固定向量通过；未发起真实 ping/query | NOT_RUN |
| discount/redeem/零元 | 官方公开页描述 `total_amount`/`show_amount`/`discount`/`redeem_id`字段 | 无真实订单/优惠验证 | NOT_RUN |
| 限流/分页/历史可查/失败 | 官方公开页记录 query-order 按创建时间倒序分页、每页50；失败/限流实际行为未验证 | 未执行真实 API | NOT_RUN |
| Supabase固定版本/runtime/相关更新 | 本地固定 Supabase CLI 2.111.0、Deno 2.9.6 | `runtime:probe` PASS；无数据库迁移 | PASS（开发工具链） |

不保存真实密钥、code、完整URL、订单个人数据；凭据只标configured/missing。真实付款授权依据单列，不从计划推断。

用户提供的脱敏 Provider 调试参考：[afdian-debug-reference.md](afdian-debug-reference.md)。当前样例未包含 `custom_order_id`；该事实已登记为 G-PROVIDER 待验证项，不得将样例视为自动用户绑定证据。用户消息中的 API Token 未保存，建议重新生成。

## 4. 每阶段记录模板

- BILL-01/2026-09-11/当前 Agent/起始HEAD：`2d058a4149017099b030d20d5382c0fa35d9fd80`。
- 实际变更文件：`packages/domain/src/contracts/billing.ts`、`packages/domain/src/contracts/index.ts`、`packages/domain/tests/billing.test.ts`、`packages/domain/tests/fixtures/fictional-provider.ts`、`tests/spikes/billing/crypto-vectors.mjs`、`package.json`，以及本记录和跨模块合同说明。
- 实现行为：固定 `free/monthly/yearly/lifetime`；`lifetime=finite/99/year`；金额仅接受两位小数十进制字符串；Provider 订单是观察 DTO；Checkout 保存平台/账户/商品/期限/价格/Provider 映射/自定义订单标识快照；结算状态区分可重试、人工审核与最终 granted/rejected。
- 依赖门槛/偏差：G-DEV 已通过；G-PROVIDER、G-OPS 未运行。未新增迁移、真实 Adapter、Webhook、Checkout 路由或权益写入。
- 验证命令：`pnpm test:billing:crypto` PASS；`pnpm test:billing:crypto:deno` PASS；`pnpm --filter @kit/domain test:unit --run` PASS（2 files/6 tests）；`pnpm --filter @kit/domain typecheck` PASS；串行 `pnpm typecheck` PASS（9/9）；串行 `pnpm build` PASS（admin/template-preview 成功，保留既有导出 warning）。
- 全量 `pnpm test:unit` 未通过：已执行的 domain/ui/account-auth/account-server/account-auth-nextjs 测试通过，`template-preview` 因没有测试文件按 Vitest 返回失败；不将其记为 PASS。全量 `pnpm lint` 与 `pnpm format:check` 仍为基线失败，详见执行基线。
- 覆盖范围：静态类型和本地单测/固定向量；未覆盖真实 Provider、Local DB、调度、生产观察。
- 代码commit：`20a28ed`（`feat(billing): establish provider-neutral contract foundation`）；已 push 到 `origin/codex/billing-architecture-review`，远端 SHA 核对为 `20a28ed`。
- 未完成/阻塞/下一满足依赖任务：真实 Provider 协议与最小联调缺失，保持 purchasable/真实购买关闭；下一满足依赖任务为 BILL-02，但仍需单独派发。

实现时逐阶段追加，不覆盖失败历史；记录自身SHA可单独提交，不循环amend。

### BILL-02/2026-09-11/当前 Agent

- 实际变更文件：`supabase/migrations/20260911120819_bill_02_subscription_product_catalog.sql`、`supabase/tests/bill_02_subscription_product_catalog.sql`、`packages/domain/src/contracts/api.ts`、`packages/domain/src/contracts/index.ts`、`packages/account-server/src/index.ts`、`packages/account-server/tests/client.test.ts`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`docs/reference/contracts/account.openapi.json`、`docs/reference/contracts/admin.openapi.json`、`tooling/scripts/src/openapi-check.mjs`、`apps/admin/features/platform-settings/subscription-config-panel.tsx` 及对应架构/合同/Proposal 文档。
- 实现行为：固定 `free/monthly/yearly/lifetime` 四项目录；`lifetime` 是 finite/99/year；平台配置只允许同平台 active paid Plan，恰好一个 active paid Plan 时自动回填且不重映射已有配置；计划切换在 active/future grant 或旧计划可兑换批次存在时阻断；无 Provider product mapping 时 paid 商品明确 `purchasable=false/provider_mapping_unavailable`；管理写入使用 row version/If-Match、锁序与最近 MFA 边界。
- 验证命令：`pnpm exec supabase db reset --local --yes` PASS；`pnpm test:db` PASS（29 files/473 tests）；`pnpm contracts:check` PASS（account=19/admin=38）；`pnpm docs:check` PASS（44 documents）；`pnpm exec deno test -A supabase/functions/account-api/index.test.ts` PASS（21 tests）；`pnpm --filter @kit/account-server test:unit` PASS（2 files/14 tests）；`pnpm sdk:pack` PASS；domain/account-server/admin typecheck PASS；`git diff --check` PASS。
- Supabase lint：`pnpm exec supabase db lint --local --fail-on error` 未通过，但仅报告已有 `admin_account_*`、`admin_file_policy_update`、`admin_deletion_job_*` 等函数的既有 error，以及本阶段函数的未使用变量 warning；BILL-02 无新增 lint error。全量 lint/format 的既有失败继续保留，不改写为 PASS。
- 覆盖范围：本地迁移 reset、pgTAP、API 单测、SDK 单测、类型、OpenAPI 和文档；未覆盖真实 Provider、真实付款、Webhook、调度、生产迁移与生产观察。
- 代码commit：`503f14c`（`feat(billing): implement subscription catalog and config`）；已 push 到 `origin/codex/billing-architecture-review`，远端 SHA 核对为 `503f14cd8c04d8b1d7c551c0acf1e68cf0bb37ad`。
- 未完成/阻塞/下一满足依赖任务：BILL-02 不启用真实购买；下一项为 BILL-03，继续补齐兑换码模型版本快照、生命周期与校正链。

### BILL-03/2026-09-11/当前 Agent

- 实际变更文件：`supabase/migrations/20260911124902_bill_03_redemption_v2_lifecycle.sql`、`supabase/tests/bill_03_redemption_v2_lifecycle.sql`、`packages/domain/src/redemption.ts`、`packages/domain/tests/billing.test.ts`、`supabase/functions/account-api/index.ts`、`supabase/functions/account-api/index.test.ts`、`apps/admin/features/redemption/platform-redemption-batches-page.tsx` 及对应架构/API/Proposal 文档。
- 实现行为：批次增加 `model_version` 与不可变 product/term/duration snapshot；V2 只接受 monthly/yearly/lifetime，lifetime 固定 finite/99/year；旧 model_version=1 批次保持原 Plan/duration/HMAC 解释；统一 normalize/validate/format 去除明确分隔符但保留 16–128 合法历史输入；Admin correction 以独立 operation、预览事件版本和强 FK 原子 revoke+grant 形成单一替代链。
- 验证命令：`pnpm exec supabase db reset --local --yes` PASS；`pnpm test:db` PASS（30 files/513 tests）；`pnpm --filter @kit/domain test:unit --run` PASS（2 files/7 tests）；`pnpm --filter @kit/domain typecheck` PASS；`pnpm exec deno test -A supabase/functions/account-api/index.test.ts` PASS（21 tests）；`pnpm --filter admin typecheck` PASS；`git diff --check` 待提交前复核。
- Supabase lint：`pnpm exec supabase db lint --local --fail-on error` 未通过，但只剩仓库既有 `admin_account_*`、`admin_file_policy_update`、`admin_deletion_job_*` 等 error；BILL-03 未新增 error，新增函数没有 lint error。全量 lint/format 的既有失败继续保留，不改写为 PASS。
- 覆盖范围：本地迁移 reset、pgTAP、Domain/API/Admin 定向测试与类型；未覆盖真实 Provider、真实结算、Webhook、调度和生产观察。
- 代码commit：待当前阶段提交后补记；push 状态待核对。
- 未完成/阻塞/下一满足依赖任务：BILL-03 不提供商业永久/Free claim；下一项为 BILL-04，建立可恢复 Checkout、Order、Inbox 与持久任务。

## 5. 要求覆盖与实际测试

| 要求ID（总计划R01～R17） | 测试路径/用例 | 环境/被测commit | 命令/exit code | 结果/证据 |
|---|---|---|---|---|
| BILL-01 G-DEV | `packages/domain/tests/billing.test.ts`、`tests/spikes/billing/crypto-vectors.mjs` | 本地 Node/Deno；工作区当前改动 | `pnpm test:billing:crypto`; `pnpm test:billing:crypto:deno`; `pnpm --filter @kit/domain test:unit --run`; `pnpm --filter @kit/domain typecheck` | PASS；真实 Provider 仍 NOT_RUN |
| BILL-02 catalog/config | `supabase/tests/bill_02_subscription_product_catalog.sql`、`supabase/functions/account-api/index.test.ts`、`packages/account-server/tests/client.test.ts` | 本地 Docker DB、Deno、Node；当前工作区 | `pnpm test:db`; `pnpm exec deno test -A supabase/functions/account-api/index.test.ts`; `pnpm --filter @kit/account-server test:unit` | PASS；Provider/生产仍 NOT_RUN |
| BILL-03 redemption/correction | `supabase/tests/bill_03_redemption_v2_lifecycle.sql`、`packages/domain/tests/billing.test.ts`、`supabase/functions/account-api/index.test.ts` | 本地 Docker DB、Deno、Node；当前工作区 | `pnpm test:db`; `pnpm --filter @kit/domain test:unit --run`; `pnpm exec deno test -A supabase/functions/account-api/index.test.ts` | PASS；真实结算/生产仍 NOT_RUN |

重点独立记录：Checkout长幂等/响应丢失、两笔真实款、finalized重放、ACK后崩溃、lease/fence、分页移动与处理重试、99年顺延/到期/跨世纪日期、Admin真永久兼容及通用替代链、删除/归档/批次并发、服务端故障授权。

## 6. 迁移与保留

- 旧Plan/未结束Grant/可兑Batch/历史码合法格式分布：未验证。
- FK/锁顺序/匿名保留/保留期/责任人/清理checkpoint决策：未冻结。
- CLI命令与迁移文件、升级fixture/空库reset：未执行。
- 普通7天幂等清理与长期绑定、删除后迟到通知：未验证。
- correction链及退款目标、任务/结算/删除竞态：未验证。
- schema兼容窗口、forward-fix/恢复演练：未验证。

## 7. 调度与上线准备

- 调用方/认证/频率/批量/超时/限流预算：未确定。
- 报警阈值/接收责任人/oldest_pending目标：未确定。
- 新购买/入站/结算/重试独立开关：未验证。
- 调度停机恢复/密钥轮换/积压与重复结算演练：未验证。
- G-PROVIDER/G-OPS通过和真实购买启用授权：未记录。

## 8. 最终结论与交接

实现覆盖：BILL-01～BILL-03 的本地 G-DEV 范围已完成；文档/合同检查：`docs:check` 与 `contracts:check` 待本阶段提交前复核；真实渠道：NOT_RUN；生产观察：NOT_RUN且不在默认范围。Proposal Completed：否，BILL-04～BILL-07 尚未完成。

记录当时未提交修改归属、需用户决策事项、已解决与剩余失败；不得将本地模拟成功转换为真实支付可用。
