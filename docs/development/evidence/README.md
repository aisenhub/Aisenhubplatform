# 验证证据目录

当前仅建立目录说明，没有应用PASS报告。规划文档自身检查记录在[进度](../status.md)。

任务报告文件名为T01.md、T02.md等；探针可引用同一报告中的SP-*章节，不复制冲突结论。

报告必填：任务/模块、起止时间、代码commit、环境别名、工具版本、依赖门槛、实际命令、用例ID、PASS/FAIL/NOT_RUN/BLOCKED、脱敏结果、复现方式、局限、GitHub push状态及下一步。

不得提交用户数据、真实URL中的Secret、Auth status原始密钥输出、完整Cookie、Code、文件内容或恢复凭据。原始敏感日志使用受限CI artifact，文档只链接有权限控制的位置并注明保留期。

引用commit必须能在指定仓库找到；本地未push时直说“仅本地”。不要填写虚构通过率、运行时间或Staging结果。
