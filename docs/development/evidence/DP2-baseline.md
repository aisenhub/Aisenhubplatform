# DP2进度基线校准

日期：2026-09-08。性质：仓库只读审阅与规划更新；不是新一轮应用/数据库/Staging验收。

## 基线和证据等级

- 实现基线：`31b5142421847c26e61fe733b0df67f2fecd115a`，远端`task/T04-session-revocation`已通过`git ls-remote`核对。
- 远端main：`f981ca533db67e543bbe3f6d88c337b78c0199d4`；实现分支较其多25个提交。应用已push不等于已merge；本次不合并、不部署。
- 规划分支：`codex/dp2-progress-m4-roadmap`，从上述实现基线派生；起始工作区干净。
- 读取：架构/专题、开发总计划/合同/批次、T04/T12～T17/M3/G0-S等证据、测试脚本、Auth adapter、中央路由及迁移清单。历史PASS属于原报告环境，本次未重新认证其运行结果。

## 校准后的状态

| 范围 | 当前事实 | 不可扩大的结论 |
|---|---|---|
| M0 | T01～T07有Local交付，G0-L历史PASS | G0-S仍PARTIAL，不能称托管基座全部通过 |
| M1 | T08～T11有基础迁移/权限/合同证据 | G1候选commit回归由T18-L收口，不覆盖未实现M4 |
| M2 | T13～T15本地SQL及部分SDK通过；已有中央基础API | T12/T16 PARTIAL；不能把SQL完成视作全部HTTP/UI/SSR完成 |
| M3 | M3-01～03 Local交付，包含SQL/API/最小UI | G3所有子情景证据尚需M3-R1核对，浏览器/托管不自动PASS |
| Staging | T17记录13个迁移、API v13、基础Auth/账户及logout旧JWT拒绝 | 仅记录已有基础探针；未重新读取当前云端，完整SSR/Provider/Storage/pooler/TLS未验收 |
| M4/M5/M6 | 模块规格已有，本次增加执行清单和后续路线 | 应用仍NOT_STARTED，新测试全部NOT_RUN |

## 差异、风险与承接

| 发现 | 证据 | 处置/承接 |
|---|---|---|
| README/总计划写无业务代码，验证计划写所有用例NOT_RUN | 当前迁移、应用及既有报告已存在 | 本次更新为当前摘要，历史日期范围保留 |
| T12/T16等旧证据把中央API/logout/X01列为缺失 | 后续T04、T17及中央adapter已交付基础链路 | 旧报告标为历史快照并添加当前进展引用；不改写当时测试结果 |
| SSR包主要是factory/Cookie/CSRF/returnTo工具，应用有密码登录/退出 | `packages/account-auth-nextjs/src/index.ts`及两个Auth路由 | T12-R1补真实client/刷新/PKCE，T16-R2验浏览器 |
| logout调用未显式scope | `revokeSupabaseSession`；安全专题要求默认local | T12-R1按固定Provider文档和双独立会话实测，当前不宣称scope合同通过 |
| 普通近期认证仍有真实发行缺口，Admin proof已有路由/合同但不代表全部认证流程完成 | T04证据；中央与Admin OpenAPI均已有recent-proof，当前32个Admin操作含此项 | T12-R2复用现有路由，补普通流程/消费者/测试；新增合同先登记 |
| T13～T15报告完成范围比原任务完整UI/HTTP窄 | 各报告明确留给后续；现有页面清单有限 | T16-R1覆盖最小M2管理/账户链路，M5完善资源体验 |
| 根API/E2E入口为占位，CI仅工程/单测/静态合同 | package.json、`not-enabled.mjs`、workflow.yml | T16-R2接真实Local fixture、SQL/API/浏览器CI |
| 同码10路并发不能证明所有权益/兑换验收情景 | M3证据摘要与V-ENT-01～03、V-REDEEM-01～04矩阵范围不同 | M3-R1逐断言核对并补缺；不直接判FAIL或G3 PASS |
| Staging记录默认SUPABASE_DB_URL，独立executor/TLS未证明 | G0-S证据 | T17-R1核验真实身份/权限/pooler；不可推定其角色或合规性 |
| Staging verify_jwt=true与安全专题网关要求不一致 | T17/G0-S与auth-security第6节 | T17-R1根据官方文档和请求矩阵修配置或先修ADR，不用部署成功覆盖合同 |
| M4需要备份删除屏障，但备份正式实现原属M6 | 文件与运维专题 | M4-01定义、M4-02持久基础、M4-05删除消费，M6实现联合备份和外部墓碑；避免循环依赖 |

## 验证与限制

本次检查对象为Markdown、任务依赖、链接、验收ID、公共合同引用和Git状态。静态检查不证明安全性、SQL运行、API成功或云端当前配置正确。新任务无运行PASS；数据库reset/权限/并发、Auth/浏览器、Staging探针及生产观察均未在本轮运行。

现有`docs:check`只解析首批T01～T18的任务图，虽扫描全部文档链接/验证ID，也不能单独证明新增跨批次依赖无环。本轮另以Node临时只读检查收尾、第三批及路线文件的任务ID、依赖存在/无环和导航/正文一致性：33项全部通过。脚本读取三个文件的任务标题、依赖任务字段及导航表，检查引用存在并用DFS检测环；未改变项目测试命令。

`node tooling/scripts/src/docs-check.mjs`、`node tooling/scripts/src/openapi-check.mjs`和`git diff --check`均通过。OpenAPI当前17/32包含Admin recent-proof，检查成功仅证明静态结构。Oxfmt因仓库排除Markdown而未检查本轮文件，不计PASS；详见[复核记录](../planning-review.md)。提交/远端同步以最终Git交接为准。

## 下一步

最先可派发[T12-R1](../tasks/closeout-01.md)；M3-R1、T17-R1、M4-01、M5-01有独立准备范围，但不代表自动授权执行。T18-L通过后才解锁M4-02实现。完整路线见[DP2](../roadmap-dp2.md)。
