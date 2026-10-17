# Content Rules — 6

## UX-CONTENT-READABLE-FONT-SCALE — MUST

标题、正文、标签、ID/时间等使用已确认的语义排版角色；具体字号不是跨产品统一阈值。真实中英文、缩放和窄屏下验证。

## UX-CONTENT-TRUNCATION-EXPAND — MUST

必要标题、操作、错误、安全说明和区分对象的名称必须完整可访问。优先换行/重排；不可避免截断时提供键盘与触控可用的全文/详情/复制入口。`title` 或 hover-only Tooltip 不能是唯一途径。

## UX-CONTENT-FORMATTING-LOCALE — SHOULD

日期、普通数字按明确 locale/timezone 规则格式化；ID、金额、精确时间戳等按业务精度保持，不用“刚刚/约 1k”等模糊显示替代权威值。需要对齐时使用 tabular nums，不把所有内容变成等宽字体。

Aisenhub 当前跨页面时区策略仍未统一；后续 UI 优化必须单独冻结，而不是把浏览器 locale 误写成已统一产品规则。

## UX-CONTENT-TEXT-SELECTION — SHOULD

按钮/拖拽柄等操作控件可防误选；日志、错误详情、request id、资源 ID 和有用途正文保持可选择/复制。不要对整个工作区 `select-none`。

## UX-CONTENT-READING-MEASURE — SHOULD

长说明/审计阅读按语言、字体与任务控制行长和行高；表格、ID、代码不机械套长文规则。65–75ch 只可作为拉丁长文起点，不是中文硬门。

## UX-CONTENT-COMPACT-LABELS — MUST

Status Badge、值标签和可操作筛选有不同语义。不要让所有 pill 都可点击；选中/pressed 与真实状态一致。动态长值若截断，必须有完整查看途径。
