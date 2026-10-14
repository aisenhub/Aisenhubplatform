# 阶段 02：管理员 Onboarding 与 MFA Readiness

状态：Completed（2026-10-14）  
风险级别：R3

## 目标

让现有 active System Admin 可以通过受控 Admin 路径添加新的专用管理员 identity，让目标用户独立完成双 TOTP onboarding，再激活为第二/第三名可用管理员；同时提供安全的移除路径。

## 前置条件

- 阶段 01 membership schema/domain function 已完成并通过并发验证。
- 当前 Admin security status、recent MFA attestation/proof 和 factor lifecycle 已重新核对。

## 实施内容

1. 冻结 Admin OpenAPI：管理员列表、添加 pending member、激活 member、移除 member 所需最小合同。
2. add/activate/remove 全部要求 active actor、AAL2、recent MFA、operation id 和 reason code。
3. 添加 membership 前服务端验证目标 Auth 用户存在、可用、为专用管理员 identity，不能直接把已有 Consumer 业务账号提升为管理员。
4. pending 用户登录后只能进入安全状态/MFA onboarding/退出等最小页面。
5. 服务端通过可信 Supabase Auth factor 查询确认至少两个 verified TOTP，满足后才允许激活。
6. Security 页面增加 System Admin members/readiness，不展示 TOTP secret、QR 原文或 token。
7. 当前产品允许新增备用 TOTP，但不提供 verified factor 删除入口；若未来产品化删除，必须在服务端拒绝把 active 管理员降到少于两个 verified TOTP，并继续要求 recent MFA。
8. remove 成功后撤销目标用户可撤销的 Admin session/recent-proof，旧浏览器必须失去管理权限。
9. membership add/activate/remove 及 MFA readiness 变化进入安全审计。

## 状态与错误语义

- 非管理员：`ADMIN_REQUIRED`；
- pending：admin onboarding only；
- active + AAL1：进入 MFA；
- active + AAL2：普通 Admin 可用；
- 高风险 membership mutation 无 recent proof：`RECENT_MFA_REQUIRED`；
- remove 会导致 active `< 2`：稳定业务冲突错误，UI 提示先增加并激活替代管理员；
- Auth/factor 查询不可用：失败关闭，不把目标激活为 active。

## 验证

- Admin API 合成用户矩阵；
- 0/1/2 verified factor 的激活负/正向测试；
- pending 用户越权负例；
- recent MFA 过期/重放/其他 session proof 负例；
- Admin 浏览器 E2E：A 添加 B -> B 双 TOTP -> B active -> B 独立登录；
- 删除 B 后旧 B session/recent-proof 拒绝；
- Security UI 桌面/窄屏/键盘/失败恢复。

## 退出条件

- 至少两名独立管理员可以通过产品化在线路径形成 active redundancy；
- onboarding 未完成的 pending member 不被计算为灾备可用管理员；
- membership mutation 和 factor readiness 有可调查审计。

