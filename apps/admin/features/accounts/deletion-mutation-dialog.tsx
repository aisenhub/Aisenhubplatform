'use client';

import { useState } from 'react';

import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import type { MutationState } from '@kit/ui/mutation-state';

import { SessionRetryRequiredError } from '../../app/_lib/auth/browser';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import {
  isRecentMfaRequired,
  readApiPayload,
  resourceError,
  type ResourceError,
} from '../resources/admin-resource-utils';
import type { DeletionJob } from './account-types';

export type DeletionMutationIntent =
  | {
      kind: 'start';
      requestId: string;
      idempotencyKey: string;
      title: string;
      impact: string;
    }
  | {
      kind: 'retry';
      jobId: string;
      idempotencyKey: string;
      title: string;
      impact: string;
    };

export type DeletionUnknownResolution = {
  resolved: boolean;
  title: string;
  description: string;
  technicalDetail?: string | null;
};

type Props = {
  intent: DeletionMutationIntent | null;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
  onCheckStartUnknown?: (
    requestId: string,
  ) => Promise<DeletionUnknownResolution>;
};

function caughtError(title: string, error: unknown): ResourceError {
  return {
    title,
    description: sessionErrorMessage(error),
    requestId: null,
    technicalDetail: null,
  };
}

export function DeletionMutationDialog({
  intent,
  onClose,
  onRefresh,
  onCheckStartUnknown,
}: Props) {
  const [state, setState] = useState<MutationState>('confirm_required');
  const [error, setError] = useState<ResourceError | null>(null);

  if (!intent) return null;
  const activeIntent = intent;

  async function submit() {
    setState('pending');
    setError(null);
    try {
      const isStart = activeIntent.kind === 'start';
      const response = await adminAuthSession.request(
        isStart
          ? '/api/v1/admin/api/v1/deletion-jobs'
          : `/api/v1/admin/api/v1/deletion-jobs/${encodeURIComponent(activeIntent.jobId)}/retry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': activeIntent.idempotencyKey,
          },
          body: JSON.stringify(
            isStart ? { request_id: activeIntent.requestId } : {},
          ),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<DeletionJob>(response);
      if (!response.ok) {
        if (isRecentMfaRequired(response, payload)) {
          setState('step_up_required');
          return;
        }
        setState('failure');
        setError(resourceError(response, payload, '删除任务操作'));
        return;
      }
      setState(response.status === 202 ? 'accepted' : 'success');
      await onRefresh();
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setState('failure');
        setError({
          title: '会话已恢复，请重新提交',
          description: '为避免重复提交，本次删除任务操作没有自动重放。',
          requestId: null,
          technicalDetail: 'SESSION_RECOVERY_REQUIRED',
        });
        return;
      }
      setState('unknown_outcome');
      setError({
        title: '删除任务结果待确认',
        description:
          '网络在服务端响应前中断。请先读取权威状态，不要立即重新提交。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function checkUnknown() {
    try {
      if (activeIntent.kind === 'start') {
        if (!onCheckStartUnknown) return;
        const resolution = await onCheckStartUnknown(activeIntent.requestId);
        setError({
          title: resolution.title,
          description: resolution.description,
          requestId: null,
          technicalDetail: resolution.technicalDetail ?? null,
        });
        if (resolution.resolved) setState('accepted');
        return;
      }

      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/deletion-jobs/${encodeURIComponent(activeIntent.jobId)}`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<DeletionJob>(response);
      if (!response.ok || !payload?.data) {
        setError(resourceError(response, payload, '删除任务状态'));
        return;
      }
      await onRefresh();
      if (!['blocked', 'retry'].includes(payload.data.state)) {
        setState('accepted');
        setError({
          title: '任务状态已收敛',
          description:
            '服务端状态已离开可重试集合；页面没有重复提交原重试请求。',
          requestId: null,
          technicalDetail: payload.data.state,
        });
        return;
      }
      setError({
        title: '当前状态仍不能证明原请求结果',
        description:
          '任务仍处于 blocked/retry；请保留原 intent 和 Idempotency-Key，联系支持流程确认后再决定下一步。',
        requestId: null,
        technicalDetail: 'UNKNOWN_OUTCOME',
      });
    } catch (caught) {
      setError(caughtError('删除任务状态检查失败', caught));
    }
  }

  return (
    <ConfirmActionDialog
      open
      onOpenChange={(open) => {
        if (!open && state !== 'pending') {
          setState('confirm_required');
          setError(null);
          onClose();
        }
      }}
      title={activeIntent.title}
      targetIdentity={
        activeIntent.kind === 'start'
          ? activeIntent.requestId
          : activeIntent.jobId
      }
      impact={activeIntent.impact}
      reversible={false}
      state={state}
      error={error}
      stepUpContent={
        state === 'step_up_required' ? (
          <AdminRecentMfaPanel
            onVerified={() => setState('confirm_required')}
          />
        ) : null
      }
      onCheckUnknown={
        state === 'unknown_outcome' ? () => void checkUnknown() : undefined
      }
      onConfirm={() => void submit()}
    />
  );
}
