# 优化设计与实施计划

本目录存放尚未完全落地的模块优化设计和可执行计划。当前实际架构仍维护在 [architecture](../architecture/overview.md)；计划中的目标架构不能提前写入当前架构。

## 目录骨架

```text
proposals/
├── README.md
├── plan-writing.md
└── _template/
    ├── design.md
    ├── plan.md
    ├── agent-handoff.md
    ├── verification-record.md
    └── phases/
        └── 01-phase.md
```

开始优化时复制 _template 为具有明确含义的目录名，例如 account-auth-optimization。_template 只是可复用文档骨架，不代表已派发任务。

## 文档分工

- [设计模板](_template/design.md)：当前问题、目标架构、模块边界、接口与数据变化、风险。
- [总计划模板](_template/plan.md)：整体范围、阶段依赖、执行状态和总体验收。
- [阶段模板](_template/phases/01-phase.md)：具体任务、修改目录、合同、验证和退出条件。
- [计划编写规范](plan-writing.md)：如何把架构优化写成 Agent 可执行的计划。
- [Agent 交接模板](_template/agent-handoff.md)：执行入口、边界、协作和 Git 规则。
- [验证记录模板](_template/verification-record.md)：实际实施、验证、提交和交接记录。

新增优化后在下方索引登记设计和总计划链接；阶段由对应总计划导航。小型优化可以只用 design.md 和 plan.md，需要详细拆解时再增加 phases 文件。

## 优化索引

- [统一订阅与中央支付架构](subscription-billing-centralization/AisenFlow_Subscription_Billing_Architecture.md)：Proposed；已完成设计审查修订，Provider 联调与功能实施尚未完成。[配套BILL实施计划](subscription-billing-centralization/README.md)已同步设计；全部功能阶段未开始，按实际派发与依赖门槛执行。

## 给计划 Agent 的执行要求

下面的提示词用于“只研究代码并生成执行计划”的 Agent。它适用于本仓库的 Account/Auth、Admin、权益兑换、文件任务、SDK、Registry 和平台参考页面等模块。执行计划生成阶段不得修改产品代码、安装依赖、部署服务或启动实施任务。

```text
请根据当前仓库的架构和代码，为本次模块优化生成一套可直接交给实施 Agent 执行的分阶段计划。

【项目输入】
- 项目路径：E:\Projects\Aisenhubplatform（如实际路径不同，以当前工作区为准）
- 目标模块：[account-auth / account-api / admin / entitlements / files-jobs / sdk / template-preview / 其他]
- 架构文档：[docs/architecture/ 下相关文件]
- 参考合同：[docs/reference/ 下相关文件；接口以 docs/reference/contracts/ 为准]
- 补充讨论结论：[可选]
- 本次范围：[必须完成的内容]
- 暂不实施：[明确排除的内容]
- 计划目录：docs/proposals/[模块名称]-optimization/

本轮只研究和编写计划，不修改产品代码，不安装依赖，不部署，不启动实施任务。

一、先核实代码再制定计划

1. 阅读根 AGENTS.md、docs/README.md、docs/agents.md、相关 architecture、reference 和适用的技能说明。
2. 检查目标模块及直接关联的 apps、packages、supabase/functions、supabase/migrations、supabase/tests、tests/spikes 和构建脚本。
3. 追踪核心操作的真实调用链，区分已经存在的代码、页面演示状态、测试夹具和仅写在文档里的目标。
4. 找出可复用能力、重复实现、关键缺口和需要退出的旧路径。
5. 文档与代码冲突时：当前行为以代码、迁移、配置和实际测试入口为准；目标行为以本次确定的架构方向为准；旧记录不能充当验证证据。
6. 未核实的文件、接口、命令、环境和能力标记为“待验证”，不得编造。
7. 仅在当前模块范围内完成必要的官方文档、固定版本或上游来源核对；不借计划任务扩展组织、支付、微服务或第三方平台能力。

二、沿用已确定的架构方向

不要重新发散已确定的设计，也不要重复询问已经写入架构或补充结论的决定。可以根据源码选择实现细节，并把选择写入计划。

如果发现架构与代码有实质冲突、数据丢失风险或不可实现前提：写明证据、影响和推荐处理方式；继续完成不依赖该问题的计划。只有无法合理推断且会改变实施结果时才列为待确认项。

三、生成总计划、阶段计划和交接文件

复制 docs/proposals/_template/ 到计划目录，并至少生成：
- design.md：目标架构设计
- plan.md：总计划和阶段依赖
- phases/01-[阶段名].md、phases/02-[阶段名].md……：可独立验收的阶段
- agent-handoff.md：实施 Agent 的执行入口
- verification-record.md：实施期间填写的验证记录模板

不为凑数量拆分阶段。小优化可以只使用 design.md、plan.md 和 agent-handoff.md；涉及跨模块、迁移、并发、外部服务或恢复时，必须拆出阶段计划。

总计划必须写清：用户问题和目标行为、已确定的架构决定、本次范围和非目标、当前代码证据和关键缺口、旧文档冲突及处理方式、阶段顺序和依赖、可并行与必须串行的工作、跨阶段数据/接口/状态契约、全局约束、风险、完成标准，以及所有阶段链接。

每个阶段必须能直接指导实施 Agent，至少写清：目标和前置条件、必读文档、已核实文件和调用链、要修改或新增的文件及职责、应复用和禁止复制的能力、数据模型/接口/状态不变量、按依赖排序的步骤、正常/空态/加载/失败/禁用/恢复状态（适用时）、并发/版本冲突/撤销/恢复（适用时）、关联模块影响、旧路径退出方式、实际验证命令和可观察结果、阶段门槛及交接内容。

四、先冻结跨阶段契约

为数据模型、身份和租户归属、状态生命周期、时间和单位、API 输入输出、保存/提交/失败/恢复边界指定唯一来源。Account/Admin 的领域规则必须进入共享 PostgreSQL private 函数；BFF、SDK、页面和 Maintenance 不得复制权益、配额或删除算法。需要实验的事项放到早期验证阶段，写明问题、方法、成功标准、失败处理和被阻塞的下游阶段。

五、控制改造范围

保持现有 TypeScript、Next.js、Supabase、PostgreSQL、Deno、pnpm、Tailwind 和 shadcn 基础设施；优先复用现有代码，不引入无必要依赖、第二套框架或假兼容层。不把未实现能力做成假按钮、假数据或假进度。第一阶段应尽量形成可验证的真实闭环；若只能先做基础设施，必须明确后续闭环依赖。

六、验证、交接和状态记录

验证必须匹配风险：普通改动做行为检查；数据库和文件改动覆盖权限、内容保留、保存失败、过期、并发和恢复；UI 改动覆盖真实浏览器操作、相关尺寸和主题；性能写明条件与判断依据。区分计划中的检查和实际执行结果；未运行统一写“未开始”或“未验证”。

agent-handoff.md 写稳定执行规则和可直接复制的实施提示词，不写日常进度。verification-record.md 只提供记录结构，计划生成时不得预填测试通过、阶段完成、commit SHA 或推送成功。

七、Git 和执行边界

实施 Agent 开始前核对远程地址、分支和工作区。沿用当前任务分支；未指定时按根 AGENTS.md 的 codex/ 分支规范创建专用分支。每阶段完成并通过必要验证后，检查 diff 和敏感信息，创建含阶段编号的 commit，push 到对应 GitHub 分支，并核对远端 commit。阶段 commit/push 已由本执行提示词授权，不需逐阶段重复询问。

禁止 force push、重写已有历史、合并主分支、创建 Release、生产部署、费用变更和破坏性恢复。缺少远程或权限时保留本地成果并报告阻塞；不能把已提交未推送写成已交付。

本轮生成计划时仍然只写文档，不执行上述 Git 操作；这些要求必须传递到 agent-handoff.md 和每份阶段计划，供后续实施 Agent 执行。

八、交付前自检

检查文档链接、已有文件与待新增文件、已有命令与待新增命令、阶段依赖无环、跨阶段契约一致、每项范围都有阶段和验收项、风险有具体处理、没有把计划状态写成已实施或已验证。最后只输出计划目录、阶段顺序、可并行工作、待确认问题和明确的未执行边界。
```

## 给实施 Agent 的执行规则

实施 Agent 接到一个已生成的 proposal 后，按以下顺序执行：

1. 读取 proposal 根目录的 `agent-handoff.md`、`verification-record.md`、`plan.md`、当前阶段文档，再读取相关 architecture、reference、源码、迁移和测试。
2. 核对当前分支、起始 commit、工作区修改和远程地址；已有未提交修改必须记录归属，不覆盖用户工作。
3. 只执行当前阶段和必要依赖；未满足前置条件就停在该阶段，完成不依赖部分并记录阻塞。
4. 按阶段步骤修改代码和测试，复用已确定的领域入口、共享类型、SDK 和 UI 基础设施，不在 BFF、Admin、页面或任务中复制领域算法。
5. 阶段结束时运行计划列出的真实命令，并根据当前代码选择必要的 `pnpm docs:check`、`pnpm contracts:check`、`pnpm lint`、`pnpm typecheck`、`pnpm build`、单元测试、数据库测试、API/浏览器探针或维护任务测试。不存在的命令不能记为通过；`NOT_RUN` 只能写成未运行。
6. 更新 `verification-record.md`：写实际修改、实际行为、实际命令、环境、退出码、失败与复测、未完成项和交接内容。代码变化后，原验证结果不再自动覆盖新代码。
7. 检查差异和敏感信息，提交本阶段代码并 push；核对远端分支包含该 commit 后，才把阶段记为“已交付”。
8. 下阶段开始前，读取最新验证记录并重新核对代码，不重复实施已完成内容。遇到架构冲突、数据风险、外部依赖或需要用户决定的事项，停止依赖该决定的工作并明确记录。

多 Agent 协作时，总计划指定文件所有权和集成人；一个文件同一时间只由一个 Agent 修改。各 Agent 先提交自己的阶段成果，由集成人按顺序集成、解决合同冲突并执行跨模块验证；并行不适用于共享迁移、OpenAPI、共享类型、同一页面或同一公共组件的同时修改。

## 维护方式

设计确定后再拆分阶段，执行时更新计划状态并链接实际验证结果。每阶段完成后同步当前架构；全部验收满足后将 proposal 标记 Completed。保留、归档或清理由用户要求决定。

维护规则见 [docs/agents.md](../agents.md)。编写计划不自动授权执行其中的任务。
