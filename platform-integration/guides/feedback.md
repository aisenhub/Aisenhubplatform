# Feedback

Feedback 的 Consumer 流程是 draft → attachments → submit。

## 典型流程

1. `createFeedback`
2. 可选 `patchFeedback`
3. 每张图片：`createFeedbackAttachmentIntent` → `uploadFeedbackAttachmentContent`
4. 需要撤销未提交附件时 `deleteFeedbackAttachment`
5. `submitFeedback`

## 边界

- 附件仅使用 canonical contract 允许的 JPEG/PNG/WebP 与大小限制。
- 图片通过同源 BFF binary proxy，不直连 private Storage。
- 用户、平台账户和提交时联系邮箱由已认证中央上下文确定，不信任 body 伪造 ownership/email。
- submit 后按合同处理不可变/状态边界。
- Admin 反馈处理中心是中央运营能力，不是 Consumer 可调用的 private API。
