# Workflow Rules — 7

## UX-WORKFLOW-BATCH-OPERATIONS — SHOULD（存在真实重复多项操作时）

批量选择与动作明确当前范围、筛选影响和对象数量，不要求固定浮动工具栏。危险批量动作仍遵循确认、权限、MFA、幂等与审计。

## UX-WORKFLOW-ACTION-FIRST — MUST

核心行动和高频操作可发现、可持续执行，不用“固定三次点击”或“每页唯一 CTA”衡量所有管理任务。次要动作按频率进入菜单/Inspector。

## UX-WORKFLOW-CONTEXT-PRESERVATION — MUST

导航、resize、异步刷新和详情切换尽量保留当前 scope、对象、滚动、展开和合法草稿；目标失效时进入合理状态并解释。不要无条件整页 reload 或回顶。

## UX-WORKFLOW-DATA-PERSISTENCE — MUST

合法结果沿现有 API/领域命令保存；UI 不发明第二套写入真值。失败不假装已保存，并发/If-Match/operation_id/recent MFA 等按真实合同执行，页面不能为了 UX 简化而静默绕过。

## UX-WORKFLOW-CANCEL-STALE-RESULTS — MUST

取消、切换 Platform/对象或发起新请求后，已完成可信工作保留；迟到响应不能覆盖当前 scope/selection。结果未知的非幂等管理动作不得自动重复执行。

## UX-WORKFLOW-SAVE-EXPORT-RESULT — MUST

计算完成、请求 accepted、服务端写入完成、下载/导出文件可用是不同事实。只有任务存在保存/导出时适用；取消/写入失败保护原结果并提供恢复，不用 100% 进度冒充可用成品。

## UX-WORKFLOW-AI-SOURCE-COST-EGRESS — MUST（仅存在 AI/外部模型调用时）

有用途时明确结果来源、可能费用和材料外发范围；未知价格不显示 0，不把 AI 结果伪造成人工确认。当前 Admin 若没有此类产品能力，不因此新增 AI UI；未来相关功能必须先有正式 Requirement/安全合同。
