# 决策、默认参数与外部输入 DP1

基线日期2026-09-07。状态：CONFIRMED为用户确认或既定领域边界；DEFAULT为可用于本地实现的工程默认；VERIFY为需运行验证；EXTERNAL为需项目所有者提供的真实环境信息。

## DP2状态增补（2026-09-08）

下方2026-09-07工具记录为历史核对，不代表当前仍缺工具：T02已导入固定上游并安装项目依赖，固定CLI为2.111.0，T03记录Deno安装到D盘。具体版本以lock与执行时核对为准，本轮未安装/升级软件。

| 项目 | 当前证据边界 | 承接 |
|---|---|---|
| X01 | Staging基础已建立并有历史探针记录 | T17-R1执行前重新核对目标与权限 |
| X02/X03 | 托管站点/代理链、Google/SMTP仍未闭环 | T17-R2/R3；不能将配置缺口写成实现PASS |
| X04/X05/X06 | 当前证据未证明已提供 | M6-01整理，实际备份/发布/容量前确认 |
| D05 | Local角色/pooler有证据，托管独立身份/TLS仍未证明 | T17-R1 |
| D06 | Admin Local MFA/proof有证据，普通reauth及浏览器待补 | T12-R2、T17-R2 |
| 网关差异 | 已按安全专题及官方指南将仓库 `account-api` 配置改为 `verify_jwt=false`；远端旧部署未变更/未重验 | T17-R1；由 adapter 执行逐路由 Platform Key/JWT/AAL2 检查，hosted 矩阵待受控输入 |
| 会话范围 | 当前logout调用未显式scope，不宣称local语义已验收 | T12-R1双独立会话实测 |
| 文件/备份交界 | M4需持久屏障，M6负责真实备份与外部墓碑 | M4-01/02/05和M6-01/02，保持原领域不变量 |

本表只校准验证状态，不改变P01～P08默认值或预先批准外部资源。详细任务见[收尾](tasks/closeout-01.md)、[第三批](tasks/batch-03.md)及[后续路线](roadmap-dp2.md)。

## 1. 已确定的设计

| ID | 决策 | 状态 | 实施影响 |
|---|---|---|---|
| D01 | 全部自营平台，共享Global Identity、不承诺平台绑定JWT | CONFIRMED | M2分别测试身份复用与Key租户限制 |
| D02 | 后端按实际字节校验后上传，不发浏览器上传签名 | CONFIRMED | M0上传探针、M4完整状态机 |
| D03 | V1单体、单Admin、无支付/组织/第三方接入 | CONFIRMED | 不新增相关模块 |
| D04 | Free读取回退、不可变Grant/有序事件、统一SQL写入口 | 基线固定 | M3重放和并发验收 |
| D05 | 私有SQL通过TLS事务pooler、独立executor | VERIFY | SP-SQL本地+托管证据；失败先修订ADR |
| D06 | Admin近期MFA证明绑定session、5分钟有效 | VERIFY | SP-AUTH证明不能靠refresh续期 |
| D07 | unknown写入不释放预算，不猜测Storage已取消 | 基线固定 | M4给出保持占用/人工处理路径 |
| D08 | M1只建立可审计删除请求/门闩骨架，M4完成对象相关清除 | 实施顺序固定 | 不在M2提供可用的半成品Global Purge |
| D09 | 普通近期认证采用独立 email `token_hash` Auth session；中央 proof 绑定原业务 session，临时 session 必须撤销 | VERIFY（Local已实测） | BFF不得返回临时token；Account API验证双session与5分钟Auth session窗口，无法核实时拒绝 |

## 2. 上游及工具核对事实

2026-09-07只读核对：

- Makerkit准确来源：[makerkit/nextjs-saas-starter-kit-lite](https://github.com/makerkit/nextjs-saas-starter-kit-lite)。
- 导入候选固定commit：c5cba64391a80620309c4178163dc2df42568d1b；LICENSE为MIT，保留MakerKit版权声明。本轮没有复制其代码或安装依赖。
- 根manifest要求Node>=22.13.0、packageManager=pnpm@11.18.0。
- 固定commit的catalog含Next16.3.0、React19.2.8、TypeScript7.0.2、Vitest4.1.10、supabase-js2.111.0、SSR ^0.12.4；测试/格式工具含Oxlint/Oxfmt。不得照旧版README假定ESLint/Prettier或不同版本。
- 本机已检测Node24.19.0、pnpm11.24.0、Docker客户端和服务端29.7.2。Supabase与Deno不在当前PATH；这不证明其他目录没有安装。

引用：[固定commit](https://github.com/makerkit/nextjs-saas-starter-kit-lite/tree/c5cba64391a80620309c4178163dc2df42568d1b)、[依赖catalog](https://github.com/makerkit/nextjs-saas-starter-kit-lite/blob/c5cba64391a80620309c4178163dc2df42568d1b/pnpm-workspace.yaml)。

导入使用上述固定commit及其lockfile；先审查安装脚本和依赖可获得性，再clean install。pnpm按上游11.18.0固定，不能因本机存在11.24.0就静默改锁文件。Node使用本机已存在的24.19.0并记录CI一致版本。Supabase CLI与Deno不在当前PATH；T01又检查了`D:\APP\Codex`、`D:\APP\Base`、常见用户程序目录及npm bin目录，仍未发现对应可执行文件。这只记录已检查范围，不声称全盘未安装。Supabase CLI优先采用项目内由lock固定的`2.111.0`并通过`pnpm exec supabase`运行；Deno尚无可验证版本，T03前按D盘安装规则补齐并记录，不虚构版本号。

项目测试优先现有Vitest/Playwright/pgTAP；不另引入第二套测试框架。上游脚本中的git clean、自动fix、生产deploy快捷命令先禁用/改为受控操作，不能在导入时直接执行。

所有新增可自定义路径的软件遵循根AGENTS安装规则；项目依赖目录不代替系统软件安装目录。现有C盘工具可调用，不主动重装到C盘。

## 3. 默认参数与确认时点

| ID | 初始值 | 谁确认/最晚时点 | 未确认时允许做什么 |
|---|---|---|---|
| P01 | 文件1MiB、10个、总10MiB | 业务负责人，G4-S前 | 按默认本地实现，配置可下调 |
| P02 | access JWT15min、step-up5min | 安全/项目负责人，G2-S前 | 本地固定时钟测试 |
| P03 | 授权不缓存、3秒总预算 | 基线固定，压测验证G2-S/G6 | 不以缓存绕过失败 |
| P04 | 兑换5/账户/分钟、30/IP、300/平台 | 运营，G6前 | 计数器可配置，边界语义固定 |
| P05 | 16个/实例、2个/账户接收 | 性能验证，G4-S前 | 压测，不保证在所有host可用 |
| P06 | 关闭30天清理、历史365天、备份30天 | 数据负责人，G6前 | 测试虚构数据，不启动生产清除 |
| P07 | 联合RPO24小时、RTO4小时 | 业务/运营，G6前 | 制作演练方案，不承诺已达标 |
| P08 | 授权p95<=500ms、100rps/15min | 容量负责人，G6前 | 作为候选负载，报告资源与成本 |

负责人是项目责任类别，不虚构已存在团队成员。当前由项目所有者统一确认。调整默认值应记录日期、原因、影响用例；影响安全不变量时必须先修订架构。

## 4. 外部输入

| ID | 所需信息 | 阻塞门槛 | 可独立继续的工作 |
|---|---|---|---|
| X01 | 独立Staging Supabase项目、区域、最小凭据 | G0-S/G2-S | Local工程、迁移、类型和fixture |
| X02 | Admin/BFF实际部署host、Staging域名/可信代理链 | 上传与SSR托管验证 | 本地有界接收、接口和CSRF测试 |
| X03 | Google OAuth测试客户端、回调地址、SMTP测试发送配置 | 真实OAuth/邮箱E2E | 密码本地流程、callback负向测试 |
| X04 | 独立备份目标、加密/凭据托管、告警接收渠道 | G6 | manifest及恢复脚本设计、隔离模拟 |
| X05 | 正式npm scope、Registry地址与发布权限 | G5-P | G5-L本地tarball及静态Registry测试 |
| X06 | 生产区域、预算、预计平台/用户/负载 | G6 | 默认容量测试及记录 |

不得把上述真实值写进公开仓库。证据记录环境别名与脱敏结果，Secret通过受控配置传递。缺少输入时先完成对应本地任务，再明确指出被阻塞的托管验证。

## 5. 技术结论记录模板

每个SP-*报告必须包含：固定版本/commit、环境、假设、最小复现、实际权限、预期与结果、失败样例、是否可重复、剩余限制、受影响任务。状态只能NOT_RUN/PASS/FAIL/BLOCKED，不用“应该支持”代替实测。

如果验证推翻D05/D06/D02的实现路径，创建ADR，说明保持领域不变量的替代方案及新增风险；本轮规格不预先授权降级安全边界。
