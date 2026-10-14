'use client';

import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  isRecentMfaRequired,
  readApiPayload,
  resourceError,
  type ResourceError,
} from '../resources/admin-resource-utils';
import { AdminRecentMfaPanel } from './admin-recent-mfa-panel';

type SecurityStatus = {
  membership_state: 'pending' | 'active';
  verified_totp_count: number;
  active_admin_count: number;
  member_count: number;
  readiness_healthy: boolean;
};

type SystemAdminMember = {
  user_id: string;
  email: string | null;
  state: 'pending' | 'active';
  verified_totp_count: number;
  auth_available: boolean;
  created_at: string | null;
  activated_at: string | null;
  created_by_user_id: string | null;
};

type Intent = {
  kind: 'add' | 'activate' | 'remove';
  targetUserId: string;
  operationId: string;
};

const systemAdminsPath = '/api/v1/admin/api/v1/security/system-admins';

export function SystemAdminMembersPanel() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [members, setMembers] = useState<SystemAdminMember[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>(
    'loading',
  );
  const [loadError, setLoadError] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [mutationState, setMutationState] = useState<MutationState>('idle');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const statusResponse = await adminAuthSession.request(
        '/api/v1/admin/api/v1/security/status',
        { cache: 'no-store' },
      );
      const statusPayload =
        await readApiPayload<SecurityStatus>(statusResponse);
      if (!statusResponse.ok || !statusPayload?.data) {
        setLoadState('error');
        setLoadError(
          resourceError(statusResponse, statusPayload, 'System Admin readiness')
            .description,
        );
        return;
      }
      setStatus(statusPayload.data);
      if (statusPayload.data.membership_state === 'pending') {
        setMembers([]);
        setLoadState('success');
        return;
      }
      const membersResponse = await adminAuthSession.request(systemAdminsPath, {
        cache: 'no-store',
      });
      const membersPayload =
        await readApiPayload<SystemAdminMember[]>(membersResponse);
      if (!membersResponse.ok || !Array.isArray(membersPayload?.data)) {
        setLoadState('error');
        setLoadError(
          resourceError(membersResponse, membersPayload, 'System Admin 成员')
            .description,
        );
        return;
      }
      setMembers(membersPayload.data);
      setLoadState('success');
    } catch (caught) {
      setLoadState('error');
      setLoadError(sessionErrorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openIntent(kind: Intent['kind'], userId: string) {
    setMutationError(null);
    setMutationState('confirm_required');
    setIntent({ kind, targetUserId: userId, operationId: crypto.randomUUID() });
  }

  async function submitIntent(reason: string) {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    const path =
      intent.kind === 'add'
        ? systemAdminsPath
        : `${systemAdminsPath}/${encodeURIComponent(intent.targetUserId)}/${intent.kind}`;
    try {
      const response = await adminAuthSession.request(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(intent.kind === 'add'
              ? { target_user_id: intent.targetUserId }
              : {}),
            operation_id: intent.operationId,
            reason,
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Record<string, unknown>>(response);
      if (!response.ok) {
        if (isRecentMfaRequired(response, payload)) {
          setMutationState('step_up_required');
          return;
        }
        setMutationState('failure');
        setMutationError(resourceError(response, payload, 'System Admin 操作'));
        return;
      }
      setMutationState('success');
      await load();
    } catch (caught) {
      setMutationState('unknown_outcome');
      setMutationError({
        title: 'System Admin 操作结果待确认',
        description: `${sessionErrorMessage(caught)}。请先刷新成员列表确认 operation_id 的实际结果，不要立即重复创建新操作。`,
        requestId: null,
        technicalDetail: intent.operationId,
      });
    }
  }

  if (loadState === 'loading') return <AsyncState state="loading" />;
  if (loadState === 'error')
    return (
      <AsyncState
        state="error"
        title="System Admin readiness 读取失败"
        description={loadError}
        onRetry={() => void load()}
      />
    );
  if (!status) return null;

  if (status.membership_state === 'pending') {
    return (
      <div className="panel gap-4" data-test="system-admin-pending-onboarding">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>管理员 onboarding</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              当前 membership 仍为 pending，不具备普通 Admin 业务权限。
            </p>
          </div>
          <StatusBadge label="待激活" tone="warning" rawValue="pending" />
        </div>
        <Alert>
          <AlertTitle>先完成双 TOTP，再由另一名 active 管理员激活</AlertTitle>
          <AlertDescription>
            服务端当前确认 {status.verified_totp_count} 个 verified TOTP。生产
            readiness 要求至少两个；达到要求后仍不会自动激活。
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => window.location.assign('/admin/mfa')}
          data-test="system-admin-pending-mfa"
        >
          管理 MFA 因子
        </Button>
      </div>
    );
  }

  return (
    <div className="panel gap-5" data-test="system-admin-members-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>System Admin 灾备</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            membership、双 TOTP readiness 与最少 active 数量均由服务端权威判断。
          </p>
        </div>
        <StatusBadge
          label={status.readiness_healthy ? 'Ready' : '需要补强'}
          tone={status.readiness_healthy ? 'success' : 'warning'}
          rawValue={status.readiness_healthy ? 'ready' : 'not_ready'}
        />
      </div>
      <dl className="detail-list text-sm">
        <div>
          <dt>Active Admin</dt>
          <dd>{status.active_admin_count}</dd>
        </div>
        <div>
          <dt>全部 membership</dt>
          <dd>{status.member_count}</dd>
        </div>
        <div>
          <dt>当前账号 verified TOTP</dt>
          <dd>{status.verified_totp_count}</dd>
        </div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="system-admin-target-user">
            新增管理员 Auth User ID
          </Label>
          <Input
            id="system-admin-target-user"
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value.trim())}
            placeholder="00000000-0000-4000-8000-000000000000"
            data-test="system-admin-add-user-id"
          />
        </div>
        <Button
          type="button"
          disabled={!/^[0-9a-f-]{36}$/iu.test(targetUserId)}
          onClick={() => openIntent('add', targetUserId)}
          data-test="system-admin-add"
        >
          添加 pending 管理员
        </Button>
      </div>
      <ul className="data-list" data-test="system-admin-list">
        {members.map((member) => (
          <li key={member.user_id} className="gap-3">
            <span className="min-w-0">
              <strong>{member.email ?? '无邮箱 Auth 身份'}</strong>
              <small className="mt-1 block">
                {member.state} · verified TOTP {member.verified_totp_count} ·
                Auth {member.auth_available ? 'available' : 'unavailable'}
              </small>
              <ResourceId value={member.user_id} className="mt-1" />
            </span>
            <span className="flex flex-wrap gap-2">
              {member.state === 'pending' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openIntent('activate', member.user_id)}
                  data-test={`system-admin-activate-${member.user_id}`}
                >
                  激活
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openIntent('remove', member.user_id)}
                data-test={`system-admin-remove-${member.user_id}`}
              >
                移除
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && mutationState !== 'pending') setIntent(null);
          }}
          title={
            intent.kind === 'add'
              ? '添加 System Admin membership'
              : intent.kind === 'activate'
                ? '激活 System Admin'
                : '移除 System Admin'
          }
          targetIdentity={intent.targetUserId}
          impact={
            intent.kind === 'add'
              ? '创建 pending membership；目标不会获得普通 Admin 权限，必须先完成双 TOTP。'
              : intent.kind === 'activate'
                ? '服务端确认目标 Auth 与双 TOTP readiness 后才会授予同权 active Admin。'
                : '删除 membership，并撤销目标 recent-proof 与 Auth sessions；最少 active 数量由数据库并发保护。'
          }
          reversible={intent.kind !== 'remove'}
          reasonRequired
          state={mutationState}
          error={mutationError}
          stepUpContent={
            mutationState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => setMutationState('confirm_required')}
              />
            ) : null
          }
          onCheckUnknown={() => load()}
          onConfirm={submitIntent}
        />
      ) : null}
    </div>
  );
}
