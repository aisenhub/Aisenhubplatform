# Aisenhubplatform

面向多个自营平台的统一身份、平台账户、订阅权益、兑换码与配置文件后端。

当前阶段：架构v1.2与开发准备。仓库尚无应用实现、可执行迁移或生产部署，文档完成不代表系统验收完成。

## 阅读入口

- [架构基线](docs/architecture.md)：范围、边界和实现顺序。
- [开发规划](docs/development/README.md)：总计划、模块规格、首批任务与实际进度。
- [审核问题闭环](docs/review-v1.2.md)：审核意见与设计修订对照。
- [上游来源](docs/upstream-sources.md)：官方依据及待核验依赖。
- [Agent工作规则](AGENTS.md)：任务边界、安装路径、验证及提交约定。

主基座：Makerkit Lite；后端：Supabase；Admin：Next.js；产品接入：Auth SDK、Next.js适配器、Server SDK与源码模板。

V1仅服务统一运营的自营平台，不包含支付、组织/团队、第三方平台接入或跨域SSO。

## 仓库与进度

远端：[aisenhub/Aisenhubplatform](https://github.com/aisenhub/Aisenhubplatform)。按可验证阶段提交和推送；生产发布是独立流程，推送文档不部署任何服务。

依赖版本、运行和测试命令将在工程基座任务中固定；当前不提供尚不存在的启动指令。历史文档位于docs/archive，只作追溯。
