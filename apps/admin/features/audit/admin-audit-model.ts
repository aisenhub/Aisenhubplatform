import type { StatusTone } from '@kit/ui/status-badge';

export type AdminAuditEntry = {
  id?: string | null;
  request_id?: string | null;
  platform_id?: string | null;
  platform_name?: string | null;
  platform_code?: string | null;
  platform_account_id?: string | null;
  action?: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  actor_display_name?: string | null;
  actor_email?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  outcome?: string | null;
  created_at?: string | null;
};

export type AuditOutcomeStatus = {
  label: string;
  tone: StatusTone;
};

const actionLabels: Record<string, string> = {
  'platform.created': '创建平台',
  'platform.updated': '更新平台设置',
  'platform.origin_created': '新增平台接入地址',
  'platform.origin_deleted': '删除平台接入地址',
  'platform.key_created': '创建 Platform Key',
  'platform.key_revoked': '撤销 Platform Key',
  'platform.key_deployment_confirmed': '确认 Platform Key 部署',
  'account.activated': '激活平台账户',
  'account.suspended': '暂停平台账户',
  'account.restored': '恢复平台账户',
  'account.closed': '关闭平台账户',
  'billing.order.requeried': '重新查询计费订单',
  'billing.order.resolved': '人工处理计费订单',
  'deletion.request.approved': '批准身份删除请求',
  'deletion.job.retried': '重试身份删除任务',
};

const targetTypeLabels: Record<string, string> = {
  platform: '平台',
  platform_api_key: 'Platform Key',
  platform_auth_origin: '接入地址',
  platform_account: '平台账户',
  account: '账户',
  auth_user: '统一身份',
  deletion_request: '删除请求',
  deletion_job: '删除任务',
  billing_order: '计费订单',
  redemption_batch: '兑换批次',
  config_file: '配置文件',
};

const actorTypeLabels: Record<string, string> = {
  admin: '管理员',
  user: '用户',
  system: '系统',
  job: '后台任务',
  worker: '后台任务',
};

export const AUDIT_ACTION_OPTIONS = Object.entries(actionLabels).map(
  ([value, label]) => ({ value, label }),
);

export const AUDIT_TARGET_TYPE_OPTIONS = Object.entries(targetTypeLabels).map(
  ([value, label]) => ({ value, label }),
);

export const AUDIT_OUTCOME_OPTIONS = [
  { value: 'success', label: '成功' },
  { value: 'confirmed', label: '已确认' },
  { value: 'accepted', label: '已受理' },
  { value: 'pending', label: '处理中' },
  { value: 'running', label: '执行中' },
  { value: 'failed', label: '失败' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'revoked', label: '已撤销' },
  { value: 'unknown', label: '结果未确认' },
  { value: 'unrecorded', label: '未记录结果' },
] as const;

export function auditActionLabel(action: string | null | undefined): string {
  if (!action) return '未命名操作';
  return actionLabels[action] ?? action;
}

export function auditTargetTypeLabel(
  targetType: string | null | undefined,
): string {
  if (!targetType) return '未标记对象';
  return targetTypeLabels[targetType] ?? targetType;
}

export function auditActorTypeLabel(
  actorType: string | null | undefined,
): string {
  if (!actorType) return '未知主体';
  return actorTypeLabels[actorType] ?? actorType;
}

export function auditActorLabel(entry: AdminAuditEntry): string {
  if (entry.actor_type === 'system') return '系统';
  if (entry.actor_display_name?.trim()) return entry.actor_display_name.trim();
  if (entry.actor_email?.trim()) return entry.actor_email.trim();
  return auditActorTypeLabel(entry.actor_type);
}

export function auditActorSecondary(entry: AdminAuditEntry): string | null {
  const primary = auditActorLabel(entry);
  if (entry.actor_email?.trim() && entry.actor_email.trim() !== primary) {
    return entry.actor_email.trim();
  }
  if (entry.actor_type && auditActorTypeLabel(entry.actor_type) !== primary) {
    return auditActorTypeLabel(entry.actor_type);
  }
  return null;
}

export function auditPlatformLabel(entry: AdminAuditEntry): string {
  if (entry.platform_name?.trim()) return entry.platform_name.trim();
  if (entry.platform_code?.trim()) return entry.platform_code.trim();
  return entry.platform_id ? '未知平台' : '全局范围';
}

export function auditPlatformSecondary(entry: AdminAuditEntry): string | null {
  if (
    entry.platform_code?.trim() &&
    entry.platform_code.trim() !== auditPlatformLabel(entry)
  ) {
    return entry.platform_code.trim();
  }
  return null;
}

export function auditTargetLabel(entry: AdminAuditEntry): string {
  if (
    entry.target_type === 'platform' &&
    entry.target_id &&
    entry.target_id === entry.platform_id
  ) {
    return auditPlatformLabel(entry);
  }
  return auditTargetTypeLabel(entry.target_type);
}

export function auditTargetSecondary(entry: AdminAuditEntry): string | null {
  if (
    entry.target_type === 'platform' &&
    entry.target_id &&
    entry.target_id === entry.platform_id
  ) {
    return auditTargetTypeLabel(entry.target_type);
  }
  return null;
}

export function auditOutcomeStatus(
  outcome: string | null | undefined,
): AuditOutcomeStatus {
  switch (outcome?.toLowerCase()) {
    case 'success':
      return { label: '成功', tone: 'success' };
    case 'confirmed':
      return { label: '已确认', tone: 'success' };
    case 'rejected':
      return { label: '已拒绝', tone: 'danger' };
    case 'revoked':
      return { label: '已撤销', tone: 'danger' };
    case 'failed':
      return { label: '失败', tone: 'danger' };
    case 'pending':
      return { label: '处理中', tone: 'info' };
    case 'accepted':
      return { label: '已受理', tone: 'info' };
    case 'running':
      return { label: '执行中', tone: 'info' };
    case 'unknown':
    case 'unknown_outcome':
      return { label: '结果未确认', tone: 'unknown' };
    default:
      return outcome
        ? { label: outcome, tone: 'neutral' }
        : { label: '未记录', tone: 'neutral' };
  }
}
