# 优化设计与实施计划

每项模块优化在本目录维护目标设计、总计划和分阶段计划。当前实际架构仍维护在 [architecture](../architecture/overview.md)。

## 目录骨架

```text
proposals/
├── README.md
└── _template/
    ├── design.md
    ├── plan.md
    └── phases/
        └── 01-phase.md
```

开始优化时复制 _template 为具有明确含义的目录名，例如 account-auth-optimization。_template 只是可复用文档骨架，不代表已派发任务。

## 文档分工

- [设计模板](_template/design.md)：当前问题、目标架构、模块边界、接口与数据变化、风险。
- [总计划模板](_template/plan.md)：整体范围、阶段依赖、执行状态和总体验收。
- [阶段模板](_template/phases/01-phase.md)：具体任务、修改目录、合同、验证和退出条件。

新增优化后在下方索引登记设计和总计划链接；阶段由对应总计划导航。小型优化可以只用 design.md 和 plan.md，需要详细拆解时再增加 phases 文件。

## 优化索引

暂无具体优化项目；上面的模板可直接复制使用。

## 维护方式

设计确定后再拆分阶段，执行时更新计划状态并链接实际验证结果。每阶段完成后同步当前架构；全部验收满足后将 proposal 标记 Completed。保留、归档或清理由用户要求决定。

维护规则见 [docs/agents.md](../agents.md)。编写计划不自动授权执行其中的任务。
