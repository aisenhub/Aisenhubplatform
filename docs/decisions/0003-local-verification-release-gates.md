# ADR-0003：本地验证与生产门槛

状态：Accepted。Supersedes [ADR-0002](0002-development-release-environments.md)。详细执行规则统一维护在[Agent开发与发布流程](../guides/development-release-workflow.md)。

## 背景

项目需要保留按风险分级的检查和生产安全门槛，但 Hosted Staging 验证依赖远程环境、测试数据和外部配置，不作为每次变更的必需条件。Local Docker、合成 fixture 和生产前只读门槛足以作为默认交付路径；涉及数据库和核心领域的变更仍需增加本地 Supabase 验证。

## 决定

- R0 适用于文档、注释和不改变运行产物的独立测试，只执行适用静态检查。
- R1 是基础级：执行本地检查、目标页面验证和精简生产门槛。
- R2 是进阶级：在 R1 基础上执行本地 Supabase、适用 CI 和消费者验证。
- R3 适用于数据库、Auth、权限、支付、权益、Storage、业务 API/SDK/BFF、Worker、Secret 和恢复等核心或安全变更；在 R2 基础上增加领域合同、权限、并发/恢复和 Provider 证据。
- Hosted Staging 不属于必需验收环境。远程联调必须另行授权，不能替代本地验证或生产门槛，也不自动获得生产操作权限。
- Local 与 Production 必须隔离；本地验证使用合成数据，不连接或修改 Production。
- Git 分支、合并、生产授权、回退和观察规则继续按开发与发布流程执行。

## 影响与边界

该决定减少远程环境依赖和验收等待，但本地通过不能证明 Production 的配置、外部 Provider、调度、告警或容量已经可用。生产发布仍必须满足 G0–G6 适用门槛；缺少本地 Supabase 或领域证据时，相关项记录为 NOT_RUN 或 BLOCKED，不得伪造 PASS。
