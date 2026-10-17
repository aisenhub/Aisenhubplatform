# Forms / Controls Rules — 8

## UX-FORM-CREDENTIAL-REUSE — MUST

同一流程避免无意义重复输入普通参数；敏感值只沿既有安全边界复用，不能复制到 URL、日志、客户端公共状态或文档。Aisenhub Admin 不通过 UI 显示/缓存 server-only Secret 来“方便填写”。

## UX-FORM-INPUT-LABELS — MUST

字段有持续可见的用途表达，并通过 `label`/fieldset/组件模型正确关联。placeholder 只是示例，不替代需要的字段名称；不要同时制造重复标签。

## UX-FORM-REQUIRED-INDICATORS — MUST

必填/可选在输入前可判断，视觉标识与 `required`/`aria-required` 和业务校验一致，不只靠红色星号。

## UX-FORM-PASSWORD-VISIBILITY — SHOULD（仅存在可编辑且获授权的敏感输入）

敏感输入默认隐藏，适用时提供 `type=button` 的显隐控制并保持光标/焦点。不能为了“显示”重新读取本来不可见的已存 Secret。

## UX-FORM-SUBMIT-FEEDBACK — MUST

异步提交防重复，按实际时长提供 busy/feedback；快操作避免闪烁。失败保留输入，重要完成有真实结果，不要求每个保存都 Toast。

## UX-FORM-INLINE-VALIDATION — MUST

错误指出真实原因和修复方式，通过 `aria-invalid` 与关联说明连接。不要在用户尚未完成输入时不断报错或抢焦点；复杂表单可有汇总，但汇总不能替代字段错误。

## UX-FORM-INPUT-METHODS — MUST

input type、inputmode、autocomplete、paste、IME 和校验时机服务真实数据。带前导零的标识/代码不机械用 number；允许合理粘贴和密码管理器，不破坏中文组合输入。

## UX-FORM-CONTROL-STATES — MUST

default/pressed/selected/disabled/busy/invalid 与实际可执行能力一致。链接与按钮语义不同；busy 不应把仍需执行的 Cancel/恢复动作全部禁掉；Badge 不伪装成可点击控件。
