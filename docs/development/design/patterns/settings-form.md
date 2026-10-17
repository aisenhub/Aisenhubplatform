# Settings / Explicit Save Form

设置和编辑页面必须先遵循真实领域提交契约，再选择视觉形式。

## 三类常见模式

- **显式保存**：用户编辑草稿，点击保存提交；失败保留输入，成功以后端/权威重读为准。
- **即时应用**：改变选项立即产生可逆、低风险结果；无需额外保存，但需要真实失败恢复。
- **任务型提交**：配置只是启动任务的一部分，accepted/running/success/failure/unknown 需要分开。

不要为了统一 UI 把三种模式强行变成一个 Save Button。

## 显式保存要求

- 打开时显示权威当前值；
- 修改形成清楚的未提交状态；
- cancel 行为按产品/领域契约明确；
- 提交防重复；
- invalid 可定位；
- 失败保留草稿；
- 保存成功只在真实提交完成后呈现；
- 高风险设置仍由服务端权限、recent MFA、If-Match/operation_id 等决定。

复杂表单是否采用 React Hook Form/Zod 属于实现选择，不是 Design System 对所有表单的硬要求。
