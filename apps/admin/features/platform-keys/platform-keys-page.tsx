'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { OneTimeSecretPanel } from '@kit/ui/one-time-secret-panel';
import { ResourceId } from '@kit/ui/resource-id';
import { ResourceInspector } from '@kit/ui/resource-inspector';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  formatUtc,
  readApiPayload,
  resourceError,
  resourcePath,
  statusLabel,
  statusTone,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';

type PlatformKey = {
  key_id: string;
  platform_id: string;
  name: string;
  hmac_key_version: number;
  key_prefix: string;
  key_suffix: string;
  status: string;
  expires_at: string | null;
  revoked_at: string | null;
  creation_operation_id: string | null;
  created_at: string | null;
  deployment_confirmed_at: string | null;
  deployment_confirmed_by?: string | null;
};

type KeyIntent =
  | {
      kind: 'create';
      name: string;
      creationOperationId: string;
      title: string;
      impact: string;
    }
  | {
      kind: 'confirm-deployment' | 'revoke';
      key: PlatformKey;
      title: string;
      impact: string;
    };

export function PlatformKeysPage() {
  const { platform } = usePlatformContext();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [draftQuery, setDraftQuery] = useState(query);
  const [keys, setKeys] = useState<PlatformKey[]>([]);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [intent, setIntent] = useState<KeyIntent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );
  const [secret, setSecret] = useState<string | null>(null);
  const [inspectorKey, setInspectorKey] = useState<PlatformKey | null>(null);

  useEffect(() => setDraftQuery(query), [query]);

  const load = useCallback(
    async (background = false) => {
      setRefreshing(background);
      setRefreshError(null);
      if (!background) {
        setState('loading');
        setError(null);
      }
      try {
        const suffix = query.trim()
          ? `?q=${encodeURIComponent(query.trim())}`
          : '';
        const response = await adminAuthSession.request(
          `${resourcePath(platform.platform_id, '/keys')}${suffix}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<PlatformKey[]>(response);
        if (!response.ok || !Array.isArray(payload?.data)) {
          const nextError = resourceError(
            response,
            payload,
            'Platform Key 列表',
          );
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        setKeys(payload.data);
        setState('success');
        return payload.data;
      } catch (caught) {
        const nextError: ResourceError = {
          title: 'Platform Key 列表读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        };
        if (background) setRefreshError(nextError);
        else {
          setError(nextError);
          setState('error');
        }
      } finally {
        setRefreshing(false);
      }
    },
    [platform.platform_id, query],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  function applyQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (draftQuery.trim()) params.set('q', draftQuery.trim());
    else params.delete('q');
    router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  function openCreate() {
    const name = 'BFF key';
    setMutationError(null);
    setMutationState('confirm_required');
    setIntent({
      kind: 'create',
      name,
      creationOperationId: crypto.randomUUID(),
      title: '创建 Platform Key',
      impact:
        '明文只会在本次服务端响应后进入当前页面内存；关闭或确认后不会再次创建来恢复明文。',
    });
  }

  function openKeyAction(
    key: PlatformKey,
    kind: 'confirm-deployment' | 'revoke',
  ) {
    setMutationError(null);
    setMutationState('confirm_required');
    setIntent({
      kind,
      key,
      title: kind === 'revoke' ? '撤销 Platform Key' : '确认 Key 已部署',
      impact:
        kind === 'revoke'
          ? '撤销后该 Key 不可恢复；请确认目标服务已切换到新的已部署 Key。'
          : '服务端会记录部署确认；只有确认成功后，旧 active Key 才能进入撤销流程。',
    });
  }

  async function submitIntent() {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    try {
      const response = await adminAuthSession.request(
        intent.kind === 'create'
          ? resourcePath(platform.platform_id, '/keys')
          : resourcePath(
              platform.platform_id,
              `/keys/${encodeURIComponent(intent.key.key_id)}/${intent.kind === 'revoke' ? 'revoke' : 'confirm-deployment'}`,
            ),
        intent.kind === 'create'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: intent.name,
                creation_operation_id: intent.creationOperationId,
              }),
            }
          : { method: 'POST' },
        { replay: 'never' },
      );
      const payload = await readApiPayload<
        PlatformKey & { presented_key?: string }
      >(response);
      if (!response.ok) {
        if (
          payload?.error?.code === 'RECENT_MFA_REQUIRED' ||
          payload?.error?.code === 'MFA_REQUIRED'
        ) {
          setMutationState('step_up_required');
          return;
        }
        setMutationState('failure');
        setMutationError(resourceError(response, payload, 'Platform Key 操作'));
        return;
      }
      if (intent.kind === 'create') {
        if (!payload?.data?.presented_key) {
          setMutationState('failure');
          setMutationError({
            title: 'Key 已创建但明文未返回',
            description:
              '页面不会再次创建来恢复明文。请通过 creation_operation_id 和服务端 metadata/support 流程处置。',
            requestId:
              response.headers.get('x-request-id') ??
              payload?.request_id ??
              null,
            technicalDetail: intent.creationOperationId,
          });
          return;
        }
        setSecret(payload.data.presented_key);
        setIntent(null);
        setMutationState('confirm_required');
        await load(true);
        return;
      }
      setMutationState('success');
      await load(true);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新提交',
          description: '本次高风险 Key 操作没有自动重放；原 intent 仍保留。',
          requestId: null,
          technicalDetail: 'SESSION_RECOVERY_REQUIRED',
        });
      } else {
        setMutationState('unknown_outcome');
        setMutationError({
          title: 'Key 操作结果待确认',
          description:
            '网络在服务端响应前中断。请先按 creation_operation_id 或 Key ID 检查服务端 metadata，不要立即创建第二个 Key。',
          requestId: null,
          technicalDetail: null,
        });
      }
    }
  }

  async function checkUnknown() {
    const latestKeys = await load(true);
    const currentKeys = latestKeys ?? keys;
    if (!intent) return;
    if (intent.kind === 'create') {
      const matched = currentKeys.find(
        (key) => key.creation_operation_id === intent.creationOperationId,
      );
      setMutationError({
        title: matched ? 'Key metadata 已找到' : '还没有找到匹配 metadata',
        description: matched
          ? '明文不会因 metadata 存在而重新生成。请按受控密钥处置流程继续。'
          : '当前列表没有按 creation_operation_id 匹配的记录；页面不会按名称或时间猜测，也不会重发创建。',
        requestId: null,
        technicalDetail: matched?.key_id ?? 'UNKNOWN_OUTCOME',
      });
      return;
    }
    const matched = currentKeys.find((key) => key.key_id === intent.key.key_id);
    const settled =
      intent.kind === 'revoke'
        ? matched && matched.status !== 'active'
        : matched?.deployment_confirmed_at;
    if (settled) {
      setMutationState('success');
      setMutationError({
        title: 'Key 状态已收敛',
        description: '服务端 metadata 已反映目标状态；页面没有重复提交操作。',
        requestId: null,
        technicalDetail: matched?.status ?? 'confirmed',
      });
    } else {
      setMutationError({
        title: '当前 metadata 仍不能证明原操作结果',
        description: '请联系支持人员确认审计归属后再决定是否继续，不自动重发。',
        requestId: null,
        technicalDetail: 'UNKNOWN_OUTCOME',
      });
    }
  }

  if (state === 'loading') {
    return (
      <section className="grid gap-5" data-test="platform-keys-loading">
        <AdminPageHeader
          title="Platform Keys"
          description="Key metadata、一次性明文交付和部署生命周期。"
        />
        <AsyncState state="loading" />
      </section>
    );
  }

  return (
    <section className="grid gap-5" data-test="platform-keys-page">
      <AdminPageHeader
        title="Platform Keys"
        description="Key metadata 由服务端权威维护；明文只进入一次性内存面板，页面不提供第二次创建恢复入口。"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={refreshing}
              data-test="platform-keys-refresh"
            >
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
            <Button
              size="sm"
              onClick={openCreate}
              data-test="platform-key-open-create"
            >
              创建 Key
            </Button>
          </div>
        }
      />
      {secret ? (
        <OneTimeSecretPanel
          secret={secret}
          title="Platform Key 只显示这一次"
          description="请立即保存到受控部署位置。确认或关闭后页面不会再次读取或生成这段明文。"
          onAcknowledged={() => setSecret(null)}
        />
      ) : null}
      {state === 'error' && error ? (
        <AsyncState
          state="error"
          title={error.title}
          description={error.description}
          requestId={error.requestId}
          technicalDetail={error.technicalDetail}
          onRetry={() => void load(false)}
        />
      ) : null}
      {refreshError ? (
        <Alert variant="destructive" data-test="platform-keys-refresh-error">
          <AlertTitle>Key 列表刷新未完成</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <SupportErrorId
              requestId={refreshError.requestId}
              technicalDetail={refreshError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}
      <section className="panel gap-4">
        <form className="flex gap-2" onSubmit={applyQuery}>
          <Label htmlFor="platform-key-query" className="sr-only">
            搜索 Platform Key
          </Label>
          <Input
            id="platform-key-query"
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="名称、状态、prefix 或 suffix"
            data-test="platform-key-query"
          />
          <Button
            type="submit"
            variant="outline"
            data-test="platform-key-query-submit"
          >
            查询
          </Button>
        </form>
        {state === 'success' && keys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
            {query ? '当前搜索没有匹配 Key。' : '当前平台还没有 Platform Key。'}
          </div>
        ) : null}
        {keys.length ? (
          <div className="grid gap-3" data-test="platform-key-rows">
            {keys.map((key) => (
              <article
                key={key.key_id}
                className="grid gap-3 rounded-xl border border-border/70 bg-card p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
              >
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => setInspectorKey(key)}
                  data-test={`platform-key-inspect-${key.key_id}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="truncate text-sm">{key.name}</strong>
                    <StatusBadge
                      label={statusLabel(key.status)}
                      tone={statusTone(key.status)}
                      rawValue={key.status}
                    />
                  </span>
                  <span className="mt-2 block break-all font-mono text-xs text-muted-foreground">
                    {key.key_prefix}…{key.key_suffix} · v{key.hmac_key_version}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {key.deployment_confirmed_at ? '已确认部署' : '待部署确认'}{' '}
                    · 创建于 {formatUtc(key.created_at)}
                  </span>
                </button>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {key.status === 'active' && !key.deployment_confirmed_at ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openKeyAction(key, 'confirm-deployment')}
                      data-test={`platform-key-deploy-${key.key_id}`}
                    >
                      确认已部署
                    </Button>
                  ) : null}
                  {key.status === 'active' && key.deployment_confirmed_at ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openKeyAction(key, 'revoke')}
                      data-test={`platform-key-revoke-${key.key_id}`}
                    >
                      撤销
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && mutationState !== 'pending') setIntent(null);
          }}
          title={intent.title}
          targetIdentity={
            intent.kind === 'create' ? intent.name : intent.key.key_id
          }
          impact={intent.impact}
          reversible={intent.kind === 'confirm-deployment'}
          state={mutationState}
          error={mutationError}
          stepUpContent={
            mutationState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => setMutationState('confirm_required')}
              />
            ) : null
          }
          onCheckUnknown={
            mutationState === 'unknown_outcome'
              ? () => void checkUnknown()
              : undefined
          }
          onConfirm={() => void submitIntent()}
        />
      ) : null}

      <ResourceInspector
        open={Boolean(inspectorKey)}
        onOpenChange={(open) => {
          if (!open) setInspectorKey(null);
        }}
        title={inspectorKey?.name ?? 'Platform Key metadata'}
        description="只显示 metadata 和部署事实，不显示 Key 明文。"
      >
        {inspectorKey ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={statusLabel(inspectorKey.status)}
                tone={statusTone(inspectorKey.status)}
                rawValue={inspectorKey.status}
              />
              <ResourceId value={inspectorKey.key_id} />
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Key ID" value={inspectorKey.key_id} mono />
              <Detail
                label="Creation operation ID"
                value={inspectorKey.creation_operation_id ?? '—'}
                mono
              />
              <Detail
                label="HMAC 版本"
                value={`${inspectorKey.hmac_key_version}`}
              />
              <Detail
                label="Prefix / suffix"
                value={`${inspectorKey.key_prefix}…${inspectorKey.key_suffix}`}
                mono
              />
              <Detail
                label="创建时间"
                value={formatUtc(inspectorKey.created_at)}
              />
              <Detail
                label="部署确认"
                value={formatUtc(inspectorKey.deployment_confirmed_at)}
              />
              <Detail
                label="到期时间"
                value={formatUtc(inspectorKey.expires_at)}
              />
              <Detail
                label="撤销时间"
                value={formatUtc(inspectorKey.revoked_at)}
              />
            </dl>
          </>
        ) : null}
      </ResourceInspector>
    </section>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 break-all text-foreground ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
