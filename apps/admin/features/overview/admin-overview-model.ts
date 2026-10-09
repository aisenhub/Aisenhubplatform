export type OverviewPlatform = {
  platform_id: string;
  code: string;
  name: string;
  status: string;
  allow_activation: boolean;
};

export type OverviewDeletionJob = {
  job_id: string;
  request_id: string;
  state: string;
  checkpoint: string;
  retry_count: number;
  last_error_code?: string | null;
  created_at?: string | null;
};

export type OverviewAuditEntry = {
  id?: string | null;
  request_id?: string | null;
  action?: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  outcome?: string | null;
  created_at?: string | null;
};

export type OverviewBillingAlert = {
  alert_id: string;
  alert_key: string;
  severity: 'warning' | 'high' | 'critical';
  status: 'active' | 'recovered';
  occurrence_count: number;
  delivery_status: 'pending' | 'delivered' | 'failed';
  delivery_attempts: number;
  last_delivery_error?: string | null;
  details: Record<string, unknown>;
};

export type OverviewBillingMetrics = {
  pending_count: number;
  processing_count: number;
  retryable_count: number;
  completed_count: number;
  manual_review_count: number;
  duplicate_payment_count: number;
  retry_budget_exhausted_count: number;
  refund_mismatch_count: number;
  active_alert_count: number;
  pending_alert_delivery_count: number;
  alerts: OverviewBillingAlert[];
};

export type OverviewSourceStatus = 'loading' | 'success' | 'error';
export type OverviewTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';
export type AttentionSeverity = 'critical' | 'warning' | 'info';

export type AttentionItem = {
  key: string;
  severity: AttentionSeverity;
  title: string;
  description: string;
  href: string;
  badge: string;
};

const severityOrder: Record<AttentionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const auditActionLabels: Record<string, string> = {
  'platform.created': '创建平台',
  'platform.updated': '更新平台设置',
  'platform.origin_created': '新增平台 Origin',
  'platform.key_created': '创建 Platform Key',
  'platform.key_revoked': '撤销 Platform Key',
  'platform.key_deployment_confirmed': '确认 Platform Key 部署',
  'account.suspended': '暂停账户',
  'account.restored': '恢复账户',
  'account.closed': '关闭账户',
};

const targetTypeLabels: Record<string, string> = {
  platform: '平台',
  platform_api_key: 'Platform Key',
  platform_auth_origin: 'Origin',
  platform_account: '账户',
  deletion_job: '删除任务',
  billing_order: '计费订单',
};

export function deriveSystemHealth(
  sourceStates: readonly OverviewSourceStatus[],
  attentionCount: number,
): { label: string; description: string; tone: OverviewTone } {
  const errorCount = sourceStates.filter((state) => state === 'error').length;
  if (errorCount > 0) {
    return {
      label: '数据不完整',
      description: `${errorCount} 个管理面数据源暂不可用`,
      tone: 'danger',
    };
  }

  const loadingCount = sourceStates.filter(
    (state) => state === 'loading',
  ).length;
  if (loadingCount > 0) {
    return {
      label: '检查中',
      description: `正在确认 ${loadingCount} 个管理面数据源`,
      tone: 'info',
    };
  }

  if (attentionCount > 0) {
    return {
      label: '需关注',
      description: `发现 ${attentionCount} 项需要管理员处理`,
      tone: 'warning',
    };
  }

  return {
    label: '正常',
    description: '平台、任务、计费与审计数据源均可读取',
    tone: 'success',
  };
}

export function buildAttentionItems(
  jobs: readonly OverviewDeletionJob[],
  billing: OverviewBillingMetrics | null,
): AttentionItem[] {
  const items: AttentionItem[] = jobs
    .filter((job) => job.state === 'blocked' || job.state === 'retry')
    .map((job) => ({
      key: `job:${job.job_id}`,
      severity: job.state === 'blocked' ? 'critical' : 'warning',
      title: job.state === 'blocked' ? '删除任务已阻塞' : '删除任务等待重试',
      description:
        [job.checkpoint, job.last_error_code].filter(Boolean).join(' · ') ||
        '需要在运维中心确认任务状态。',
      href: `/admin/operations?job_id=${encodeURIComponent(job.job_id)}`,
      badge: job.state === 'blocked' ? '高' : '需关注',
    }));

  if (!billing) return items.sort(sortAttentionItems);

  if (billing.active_alert_count > 0) {
    const activeAlerts = billing.alerts.filter(
      (alert) => alert.status === 'active',
    );
    const critical = activeAlerts.filter(
      (alert) => alert.severity === 'critical',
    ).length;
    const high = activeAlerts.filter(
      (alert) => alert.severity === 'high',
    ).length;
    items.push({
      key: 'billing:active-alerts',
      severity: critical > 0 ? 'critical' : 'warning',
      title: `${billing.active_alert_count} 个计费告警处于活动状态`,
      description:
        critical > 0 || high > 0
          ? `Critical ${critical} · High ${high}`
          : '请进入计费管理查看告警指标和处理状态。',
      href: '/admin/billing',
      badge: critical > 0 ? '高' : '需关注',
    });
  } else {
    if (billing.retry_budget_exhausted_count > 0) {
      items.push({
        key: 'billing:retry-budget',
        severity: 'critical',
        title: `${billing.retry_budget_exhausted_count} 个计费重试预算已耗尽`,
        description: '后台处理已不能继续自动重试，需要管理员检查订单状态。',
        href: '/admin/billing',
        badge: '高',
      });
    }
    if (billing.refund_mismatch_count > 0) {
      items.push({
        key: 'billing:refund-mismatch',
        severity: 'critical',
        title: `${billing.refund_mismatch_count} 笔退款状态不一致`,
        description: 'Provider 与中央结算状态存在差异，需要人工核对。',
        href: '/admin/billing',
        badge: '高',
      });
    }
  }

  if (billing.manual_review_count > 0) {
    items.push({
      key: 'billing:manual-review',
      severity: 'warning',
      title: `${billing.manual_review_count} 笔订单等待人工复核`,
      description: '订单无法自动收敛，需要管理员确认 Provider 与权益状态。',
      href: '/admin/billing?status=manual_review',
      badge: '需关注',
    });
  }

  if (billing.pending_alert_delivery_count > 0) {
    items.push({
      key: 'billing:alert-delivery',
      severity: 'warning',
      title: `${billing.pending_alert_delivery_count} 条告警等待投递`,
      description: '告警已产生，但通知投递尚未完成。',
      href: '/admin/billing',
      badge: '需关注',
    });
  }

  return items.sort(sortAttentionItems);
}

function sortAttentionItems(left: AttentionItem, right: AttentionItem) {
  return severityOrder[left.severity] - severityOrder[right.severity];
}

export function countFailureSignals(
  jobs: readonly OverviewDeletionJob[],
  billing: OverviewBillingMetrics | null,
): number {
  return (
    jobs.filter((job) => job.state === 'blocked').length +
    (billing?.retry_budget_exhausted_count ?? 0) +
    (billing?.refund_mismatch_count ?? 0)
  );
}

export function platformStats(platforms: readonly OverviewPlatform[]) {
  return {
    total: platforms.length,
    active: platforms.filter((platform) => platform.status === 'active').length,
    disabled: platforms.filter((platform) => platform.status === 'disabled')
      .length,
    activationPaused: platforms.filter(
      (platform) => platform.status === 'active' && !platform.allow_activation,
    ).length,
  };
}

export function recentChangedPlatforms(
  audit: readonly OverviewAuditEntry[],
  platforms: readonly OverviewPlatform[],
): OverviewPlatform[] {
  const platformById = new Map(
    platforms.map((platform) => [platform.platform_id, platform] as const),
  );
  const seen = new Set<string>();
  const result: OverviewPlatform[] = [];

  for (const entry of audit) {
    if (
      entry.target_type !== 'platform' ||
      !entry.target_id ||
      seen.has(entry.target_id)
    )
      continue;
    const platform = platformById.get(entry.target_id);
    if (!platform) continue;
    seen.add(entry.target_id);
    result.push(platform);
    if (result.length === 4) break;
  }

  return result;
}

export function auditActionLabel(action: string | null | undefined): string {
  if (!action) return '未命名操作';
  return auditActionLabels[action] ?? action;
}

export function auditActorLabel(entry: OverviewAuditEntry): string {
  if (entry.actor_type === 'system') return '系统';
  if (entry.actor_type === 'admin') return '管理员';
  return entry.actor_type || '未知主体';
}

export function auditTargetTypeLabel(value: string | null | undefined): string {
  if (!value) return '目标';
  return targetTypeLabels[value] ?? value;
}
