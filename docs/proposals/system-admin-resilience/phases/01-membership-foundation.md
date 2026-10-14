# 阶段 01：System Admin Membership 基础

状态：Completed（2026-10-14）  
风险级别：R3

## 目标

把 `private.system_admin` 从 singleton 映射改为可容纳多个管理员的 `pending/active` membership，并在数据库层建立并发安全的“正常路径不得少于 2 个 active 管理员”规则。

## 必读与核实

- `docs/proposals/system-admin-resilience/design.md`
- `docs/architecture/modules/identity-security.md`
- `docs/reference/data-model.md`
- 当前 canonical migration 中 `private.system_admin` 及全部引用函数
- Account/Admin SQL repository 与 Admin security status
- 所有 `system_admin` 测试 fixture、恢复脚本和 grep 命中

## 实施内容

1. 使用固定 Supabase CLI 创建 forward migration；不改写已经应用的 migration。
2. 去除 `singleton_id` 约束，建立 `user_id` 主键和 `pending/active` 状态。
3. 保留现有管理员为 active membership；升级过程不能产生零管理员窗口。
4. 新增唯一的 private membership add/activate/remove 领域入口，撤销 executor 对基础表的直接 DML。
5. membership mutation 在同一事务内串行化并重新计数；remove active member 后 `< 2` 时拒绝。
6. 更新所有授权 helper，把“存在 singleton row”改为“当前 user 是 active member”。
7. pending member 只获得后续 onboarding 所需的最小身份识别能力，不获得普通 Admin 领域操作权限。
8. 普通 Account/Consumer Principal 的“管理员身份禁止进入业务面”逻辑改为拒绝任意 active/pending System Admin member。
9. 重写测试 fixture，停止通过覆盖 singleton 来临时切换管理员；测试使用独立合成 membership 并可靠清理。

## 并发与失败条件

- 两个 active admin remove 事务并发时，最多一个可以在安全计数允许的情况下成功；最终 active 数不得小于 2。
- add 同一 user 幂等重放不产生重复 membership。
- activate/remove 已不存在目标返回稳定、可审计的结果，不通过基础表异常泄露内部结构。
- migration 失败必须事务回滚，不留下半转换 singleton/membership 混合状态。

## 验证

- fresh DB migration；
- 从当前 schema + 合成 singleton admin 升级；
- `pnpm test:db`；
- 新增至少两个独立数据库连接的 membership 并发测试；
- executor 权限负向测试；
- Consumer Principal 对所有 System Admin state 的拒绝测试。

## 退出条件

- 数据库和服务端授权不再依赖 `singleton_id`；
- active/pending 语义可被后续 API 使用；
- active 数量下限在数据库并发下成立；
- 旧 singleton fixture 路径已退出。

