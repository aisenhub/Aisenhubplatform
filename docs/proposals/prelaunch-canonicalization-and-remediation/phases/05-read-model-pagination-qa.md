# 阶段 05：Read Model、Pagination 与 QA 事实统一

状态：Completed（2026-10-14）；本阶段成果已随 Phase 07 发布，准确验证与交付版本见总验证记录。

前置：阶段 02、03、04。

覆盖：R-05、R-06、R-07、R-12；LC-08。

## R-05 Entitlement pagination

现有 `subscriptions.updated_at` 是可变 boundary，不能继续作为“稳定”cursor。

推荐目标：

- 使用 immutable account creation/key 排序，或为 entitlement Admin list 建立明确的 immutable projection sequence；
- 若需要“最近变化”视图，独立做 event/timeline endpoint，不让运营列表 cursor 依赖 mutable projection time；
- cursor 必须包含完整 tie-breaker，且不需要下一页重新解析当前 row 的 mutable timestamp。

新增 mutation-between-pages 测试：修改 cursor row、修改后续 row、暂停/恢复 entitlement 后继续翻页。

## LC-08 Billing order cursor

只允许当前 opaque cursor `(created_at,order_id)`；删除 raw timestamp parser 与旧 SQL list dispatch。增加 invalid legacy cursor 400 测试。

## R-06 Overview 单一商业事实

不要把 `admin_platform_overview` 继续维护第二套 active paid algorithm。

可选实现：

- Overview 直接组合/调用 `admin_commerce_summary`；或
- 抽出一个共享 private paid-entitlement aggregate，Overview 与 Commerce Summary 都调用它。

不可接受：复制同一 SQL 条件到两个函数。

active paid semantics 冻结为：current winning paid Grant + active paid Plan + active subscription projection + active platform account（或阶段 02 后最终定义的等价权威规则）。

## R-07 QA 修复

1. 修正文档中“已由同一 summary 驱动”的虚假历史结论；历史 verification record 不删除原记录，可追加 correction/errata。
2. 浏览器测试不再只断言 surface 出现；建立 fixture 使旧算法与新算法会产生不同结果，例如 suspended account + active subscription，然后断言 Overview 与 Commerce Summary 数值一致。
3. API/DB 测试直接证明调用链/共享 helper，而非通过文本或页面 presence 间接推断。

## R-12

阶段 03 已完成 Config cursor 改造，本阶段增加跨 API/浏览器回归，确认 UI next-page 行为。

## 验收

- 所有标记 stable 的 cursor 都有并发 mutation 测试；
- legacy Billing cursor 不再工作；
- Overview 与 Commerce Summary 对同 fixture 数值完全一致；
- verification docs 对当前事实无 false-positive 声明。
