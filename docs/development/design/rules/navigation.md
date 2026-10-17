# Navigation Rules — 4

## UX-NAV-ACTIVE-STATE — MUST

当前位置、活动标签和选中对象可辨识，视觉与 `aria-current`/selected 等真实语义一致，不只靠颜色。Aisenhub 的 Global/Platform scope 还必须满足 `REQ-ADM-002`。

## UX-NAV-HISTORY-PREDICTABLE — MUST

Back/forward、子视图和返回保持合理上下文。普通导航通常进入 history；规范化 URL、连续筛选等可按语义 replace。不要机械 `navigate(-1)`，直达链接需要合理返回目标。

## UX-NAV-DEEP-LINKING — SHOULD

适合恢复/分享的 scope、对象、视图和筛选通常进入 URL；临时 open state、Secret、私密正文和敏感材料不写 URL。连续输入不要每个字符制造 history entry。

## UX-NAV-CLICK-OVER-HOVER — MUST

核心任务入口可由点击、触控和键盘激活，不能唯一藏在 hover。Tooltip 只辅助解释，不能代替按钮名称或可操作入口。
