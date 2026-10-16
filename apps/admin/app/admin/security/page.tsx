'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';

import { AdminPageHeader } from '../../../components/shell/admin-page-header';
import {
  adminAuthSession,
  sessionErrorMessage,
  useAdminSessionSnapshot,
} from '../../_lib/auth-session';
import {
  isRecentMfaRequired,
  isResourceAccessError,
  readApiPayload,
  resourceError,
  type ResourceError,
} from '../../../features/resources/admin-resource-utils';
import { SystemAdminMembersPanel } from '../../../features/security/system-admin-members-panel';
import { AdminRecentMfaPanel } from '../../../features/security/admin-recent-mfa-panel';

type Factor = {
  id: string;
  factor_type: string;
  friendly_name: string | null;
};

export default function AdminSecurityPage() {
  const sessionSnapshot = useAdminSessionSnapshot();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [state, setState] = useState<
    'loading' | 'success' | 'access' | 'error'
  >('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteFactor, setDeleteFactor] = useState<Factor | null>(null);
  const [deleteState, setDeleteState] = useState<MutationState>('idle');
  const [deleteError, setDeleteError] = useState<ResourceError | null>(null);

  const loadFactors = useCallback(async () => {
    setState('loading');
    setErrorMessage('');
    try {
      const response = await adminAuthSession.request('/api/auth/mfa/factors', {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { factors?: Factor[] };
        error?: { code?: string };
      } | null;
      if (!response.ok) {
        setState(isResourceAccessError(response, payload) ? 'access' : 'error');
        setErrorMessage(
          resourceError(response, payload, 'MFA 状态').description,
        );
        return;
      }
      setFactors(
        Array.isArray(payload?.data?.factors) ? payload.data.factors : [],
      );
      setState('success');
    } catch (caught) {
      setState('error');
      setErrorMessage(sessionErrorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  useEffect(() => {
    if (
      sessionSnapshot.resolved &&
      ['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    ) {
      setFactors([]);
      setState('access');
      setErrorMessage('管理员会话已结束，请重新登录。');
    }
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  function openDeleteFactor(factor: Factor) {
    setDeleteFactor(factor);
    setDeleteError(null);
    setDeleteState('confirm_required');
  }

  async function confirmDeleteFactor() {
    if (!deleteFactor) return;
    setDeleteError(null);
    setDeleteState('pending');
    const epoch = adminAuthSession.getEpoch();
    try {
      const response = await adminAuthSession.request(
        `/api/auth/mfa/factors/${encodeURIComponent(deleteFactor.id)}`,
        { method: 'DELETE' },
        { replay: 'never' },
      );
      const payload = await readApiPayload<{
        deleted?: boolean;
        session_state?: 'refreshed' | 'reauth_required';
      }>(response);
      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      if (!response.ok) {
        if (isRecentMfaRequired(response, payload)) {
          setDeleteState('step_up_required');
          return;
        }
        if (payload?.error?.code === 'MFA_FACTOR_FLOOR_REQUIRED') {
          setDeleteError({
            title: '必须保留足够的已验证认证器',
            description:
              'Active System Admin 删除后仍必须至少保留 2 个 verified TOTP；pending Admin 也不能删除最后一个已验证因子。请先添加备用认证器。',
            requestId:
              response.headers.get('x-request-id') ??
              payload.request_id ??
              null,
            technicalDetail: payload.error.code,
          });
        } else {
          setDeleteError(resourceError(response, payload, 'MFA 认证器'));
        }
        setDeleteState('failure');
        return;
      }
      if (payload?.data?.session_state === 'reauth_required') {
        adminAuthSession.completeAuthentication('admin_mfa');
        window.location.assign('/admin/login');
        return;
      }
      await loadFactors();
      setDeleteState('success');
      setDeleteFactor(null);
    } catch (caught) {
      setDeleteError({
        title: '删除认证器失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
      setDeleteState('unknown_outcome');
    }
  }

  const sessionLabel =
    sessionSnapshot.state === 'authenticated'
      ? '已登录'
      : sessionSnapshot.state === 'mfa_required'
        ? '需要 MFA'
        : sessionSnapshot.state === 'refreshing'
          ? '正在刷新'
          : sessionSnapshot.state === 'expired'
            ? '已过期'
            : '未确认';

  return (
    <main className="shell wide-shell" data-test="admin-security-page">
      <AdminPageHeader
        title="安全与账户"
        description="查看当前登录状态，检查多因素认证与已验证的认证器。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadFactors()}
            disabled={state === 'loading'}
            data-test="security-refresh"
          >
            {state === 'loading' ? '读取中…' : '刷新'}
          </Button>
        }
      />

      <section className="grid gap-4 md:grid-cols-2" aria-label="安全状态">
        <div className="panel gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2>当前会话</h2>
            <StatusBadge
              label={sessionLabel}
              tone={
                sessionSnapshot.state === 'authenticated'
                  ? 'success'
                  : 'warning'
              }
              rawValue={sessionSnapshot.state}
            />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            敏感操作在服务端需要近期 MFA
            时，会在原操作窗口内显示验证步骤。认证成功后仍需你显式再次确认。
          </p>
          <dl className="detail-list text-sm">
            <div>
              <dt>Session 状态</dt>
              <dd>{sessionSnapshot.state}</dd>
            </div>
            <div>
              <dt>Step-up</dt>
              <dd>{sessionSnapshot.stepUp ?? '当前无额外验证要求'}</dd>
            </div>
          </dl>
        </div>

        <div className="panel gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2>已验证认证器</h2>
            <span className="text-sm text-muted-foreground">
              {state === 'success' ? `${factors.length} 个` : '读取中'}
            </span>
          </div>
          {state === 'loading' ? <AsyncState state="loading" /> : null}
          {state === 'access' ? (
            <AsyncState
              state="access"
              title="无法读取 MFA 状态"
              description={errorMessage}
            />
          ) : null}
          {state === 'error' ? (
            <AsyncState
              state="error"
              title="MFA 状态读取失败"
              description={errorMessage}
              onRetry={() => void loadFactors()}
            />
          ) : null}
          {state === 'success' && factors.length === 0 ? (
            <Alert data-test="security-no-factors">
              <AlertTitle>尚未绑定认证器</AlertTitle>
              <AlertDescription>
                绑定认证器后，平台 Key、账户关闭等敏感操作才能完成近期 MFA。
              </AlertDescription>
            </Alert>
          ) : null}
          {state === 'success' && factors.length > 0 ? (
            <ul className="data-list" data-test="security-factor-list">
              {factors.map((factor) => (
                <li key={factor.id}>
                  <span>
                    <strong>
                      {factor.friendly_name ||
                        factor.factor_type ||
                        'TOTP 认证器'}
                    </strong>
                    <small className="mt-1 block">
                      已验证 · {factor.factor_type}
                    </small>
                  </span>
                  <span className="flex items-center gap-2">
                    <ResourceId value={factor.id} />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openDeleteFactor(factor)}
                      data-test={`security-factor-delete-${factor.id}`}
                    >
                      删除
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            nativeButton={false}
            render={<Link href="/admin/mfa" />}
            data-test="security-manage-mfa"
          >
            管理 MFA 因子
          </Button>
        </div>
      </section>

      {deleteFactor ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && deleteState !== 'pending') setDeleteFactor(null);
          }}
          title="删除已验证 MFA 认证器"
          targetIdentity={deleteFactor.id}
          impact="删除后无法恢复该因子。服务端会重新验证因子归属、近期 MFA 和最低因子数量，并在调用 Auth Provider 删除前使当前 session 的旧 recent proof 失效。"
          reversible={false}
          asyncOperation={false}
          historyRetained={false}
          state={deleteState}
          error={deleteError}
          stepUpContent={
            deleteState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => setDeleteState('confirm_required')}
              />
            ) : null
          }
          onCheckUnknown={() => loadFactors()}
          onConfirm={() => confirmDeleteFactor()}
        />
      ) : null}

      <SystemAdminMembersPanel />
    </main>
  );
}
