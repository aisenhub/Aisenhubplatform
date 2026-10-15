# Config 与 Storage 需求

## REQ-CFG-001 — Config 是业务对象，File 是内部载体

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Functional
- **Architecture**: `architecture/modules/config-storage.md`

**Statement**

用户管理的对象必须是 Config 与 immutable Config Version；Storage object/file 仅作为版本内容的内部物理载体，不能重新暴露第二套 generic file 产品模型。

## REQ-CFG-002 — Config Version 内容不可原地改写

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

已创建 Version 的内容和版本身份必须不可变；内容变化通过创建新 Version 表达。

## REQ-CFG-003 — 中央系统不解释或执行用户 Config payload

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

中央系统只保存和分发平台声明的 Config 内容与 schema metadata，不解析、执行、预览或解压用户 payload。

## REQ-CFG-004 — 私有 Storage 不直接暴露给浏览器

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

浏览器不得获得 private Storage 写凭据或长期对象 URL；上传/下载必须经过受控 Account API/BFF 并重新验证 Principal、ownership、状态和策略。

## REQ-CFG-005 — 业务 slot 与物理容量必须分离

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Functional

**Statement**

Config 数量限制由 Entitlement slot 决定；Storage bytes 由平台物理容量策略决定。Version 增长必须计入容量，不得把 Config 数量当作字节配额。

**Acceptance**

- `config_slot_limit` 只限制 active Config 数量，不按文件/Version 数量计槽位。
- 套餐降级到低于现有 Config 数量时不得自动删除既有 Config。
- 已存在的 active Config 在 slot 降级后仍可创建新 Version；新建超额 Config 继续拒绝。
- 所有仍保留物理风险的 Version/object 继续计入平台 Storage 预算。

## REQ-CFG-006 — 外部写入未知时不得释放容量或重复写

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

Storage write 超时/结果未知必须保留 `unknown` 风险、对象路径和容量预算，并通过 reconciliation 收敛；不得因为 lease 过期或一次 404 就启动不安全重复 PUT 或释放预算。

## REQ-CFG-007 — Gallery 审核必须绑定明确 Version

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Functional

**Statement**

配置广场公开必须经过 Submission/Approval，并绑定 immutable published Version；作者创建新 Version 不得自动替换已批准公开版本。

## REQ-CFG-008 — Gallery 治理不得删除用户私有 Config

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Privacy

**Statement**

管理员移出或阻止 Gallery 只改变公开准入，不得删除用户个人 Config 或历史 Version。

## REQ-CFG-009 — 删除必须等待物理对象确认

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

Config 删除必须隐藏公开面并进入 deleting，待全部物理对象删除得到确认、unknown write 收敛且备份屏障允许后才能完成并释放容量。

## REQ-CFG-010 — 下载/应用统计只记录中央可证明事实

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Functional

**Statement**

Usage event 只能声明中央系统能够证明的交付事实；`apply_delivery_completed` 不得被解释为目标应用已经真正应用配置。

## Domain Verification

当前基线证据包括 canonical Config/Version/File/Gallery/Usage/Storage SQL、Account/Admin/Maintenance runtime 与 OpenAPI、`t23_config_resources.sql`、`t24_config_account_content.sql`、`t25_config_admin_governance.sql`、`t26_config_lifecycle.sql`、`t35_prelaunch_config_storage_canonicalization.sql`，以及 Consumer Harness Config/Gallery 场景。Storage 外部结果未知与恢复语义必须继续以 write-attempt/reconcile 测试为准，不能仅由 HTTP happy path 证明。
