'use client';

import { useState } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { adminAuthSession } from '../../app/_lib/auth-session';
import {
  apiErrorDescription,
  resourcePath,
  type ResourceError,
} from '../resources/admin-resource-utils';

type SettingsIntent = {
  change: 'status' | 'allow_activation';
  nextStatus: 'active' | 'disabled';
  nextAllowActivation: boolean;
  title: string;
  impact: string;
};

export function PlatformSettingsPage() {
  const { platform, reload } = usePlatformContext();
  const [intent, setIntent] = useState<SettingsIntent | null>(null);
  const [state, setState] = useState<MutationState>('confirm_required');
  const [error, setError] = useState<ResourceError | null>(null);

  function openToggle() {
    const disabling = platform.status === 'active';
    setError(null);
    setState('confirm_required');
    setIntent({
      change: 'status',
      nextStatus: disabling ? 'disabled' : 'active',
      nextAllowActivation: platform.allow_activation,
      title: disabling ? '停用平台' : '启用平台',
      impact: disabling
        ? '普通用户新的激活流程会受到平台状态限制；管理员仍可读取诊断和配置数据。'
        : '启用后是否允许激活仍由服务端策略决定，页面不会自行放行用户授权。',
    });
  }

  function openActivationToggle() {
    const nextAllowActivation = !platform.allow_activation;
    setError(null);
    setState('confirm_required');
    setIntent({
      change: 'allow_activation',
      nextStatus: platform.status === 'active' ? 'active' : 'disabled',
      nextAllowActivation,
      title: nextAllowActivation ? '允许新的激活' : '关闭新的激活',
      impact: nextAllowActivation
        ? '服务端将允许新的激活请求进入平台策略判断；仍不会绕过账户和平台授权。'
        : '服务端将拒绝新的激活请求；现有账户和管理员诊断不会被自动删除。',
    });
  }

  async function submitToggle() {
    if (!intent) return;
    setState('pending');
    setError(null);
    try {
      const response = await adminAuthSession.request(
        resourcePath(platform.platform_id, ''),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status:
              intent.change === 'status' ? intent.nextStatus : platform.status,
            allow_activation:
              intent.change === 'allow_activation'
                ? intent.nextAllowActivation
                : platform.allow_activation,
          }),
        },
        { replay: 'never' },
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: unknown;
        error?: { code?: string; message?: string };
        request_id?: string;
      } | null;
      if (!response.ok) {
        setState('failure');
        setError({
          title:
            response.status === 403 ? '没有平台设置权限' : '平台状态更新失败',
          description: apiErrorDescription(
            response,
            payload,
            '服务端拒绝了状态更新；当前平台数据保持不变。',
          ),
          requestId:
            response.headers.get('x-request-id') ?? payload?.request_id ?? null,
          technicalDetail: payload?.error?.code ?? `HTTP_${response.status}`,
        });
        return;
      }
      setState('success');
      setError({
        title: '平台状态已更新',
        description: '页面将重新读取当前平台上下文，顶部状态以服务端返回为准。',
        requestId:
          response.headers.get('x-request-id') ?? payload?.request_id ?? null,
        technicalDetail: null,
      });
      reload();
      setIntent(null);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setState('failure');
        setError({
          title: '会话已恢复，请重新提交',
          description: '为避免重复更新平台状态，本次请求没有自动重放。',
          requestId: null,
          technicalDetail: 'SESSION_RECOVERY_REQUIRED',
        });
      } else {
        setState('unknown_outcome');
        setError({
          title: '平台状态结果待确认',
          description:
            '网络在服务端响应前中断。请先刷新并核对顶部权威状态，不要立即重复提交。',
          requestId: null,
          technicalDetail: null,
        });
      }
    }
  }

  async function checkUnknown() {
    reload();
    setError({
      title: '已请求重新读取平台状态',
      description:
        '页面不会根据当前状态推断原 mutation 的审计结果；请确认后再决定下一步。',
      requestId: null,
      technicalDetail: 'UNKNOWN_OUTCOME',
    });
  }

  return (
    <section className="grid gap-5" data-test="platform-settings-page">
      <AdminPageHeader
        title="平台设置"
        description="General 只保留平台自身的可更新状态；name 和 code 是服务端标识，本页只读展示。"
      />

      {error && !intent ? (
        <Alert
          variant={state === 'success' ? undefined : 'destructive'}
          data-test="platform-settings-message"
        >
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>
            {error.description}
            <SupportErrorId
              requestId={error.requestId}
              technicalDetail={error.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="panel gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                General
              </p>
              <h2 className="mt-2">平台信息</h2>
            </div>
            <StatusBadge
              label={platform.status === 'active' ? '运行中' : '已停用'}
              tone={platform.status === 'active' ? 'success' : 'danger'}
              rawValue={platform.status}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label="平台名称" value={platform.name} />
            <ReadOnlyField label="平台 code" value={platform.code} mono />
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">平台 ID</div>
              <ResourceId value={platform.platform_id} className="mt-2" />
            </div>
          </div>
        </section>

        <section className="panel gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Activation policy
            </p>
            <h2 className="mt-2">平台访问开关</h2>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            平台停用不影响管理员诊断，但会由服务端阻止新的普通用户授权流程。激活能力是独立策略字段，页面不会替代服务端判定。
          </p>
          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">平台状态</dt>
              <dd className="mt-1 font-medium">{platform.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">允许激活</dt>
              <dd className="mt-1 font-medium">
                {platform.allow_activation ? '允许' : '已关闭'}
              </dd>
            </div>
          </dl>
          <Button
            variant={platform.status === 'active' ? 'destructive' : 'default'}
            className="w-fit"
            onClick={openToggle}
            data-test="platform-settings-toggle"
          >
            {platform.status === 'active' ? '停用平台' : '启用平台'}
          </Button>
          <Button
            variant="outline"
            className="w-fit"
            onClick={openActivationToggle}
            data-test="platform-settings-activation-toggle"
          >
            {platform.allow_activation ? '关闭新的激活' : '允许新的激活'}
          </Button>
        </section>
      </div>

      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && state !== 'pending') setIntent(null);
          }}
          title={intent.title}
          targetIdentity={platform.platform_id}
          impact={intent.impact}
          reversible
          state={state}
          error={state === 'success' || state === 'accepted' ? null : error}
          onCheckUnknown={
            state === 'unknown_outcome' ? checkUnknown : undefined
          }
          onConfirm={() => void submitToggle()}
        />
      ) : null}
    </section>
  );
}

function ReadOnlyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        readOnly
        value={value}
        className={mono ? 'font-mono text-xs' : ''}
      />
    </div>
  );
}
