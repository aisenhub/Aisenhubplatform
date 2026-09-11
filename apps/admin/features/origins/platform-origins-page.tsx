'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  readApiPayload,
  resourceError,
  resourcePath,
  statusLabel,
  statusTone,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';

type Origin = {
  origin_id: string;
  platform_id?: string;
  environment: string;
  origin: string;
  oauth_callback_url: string | null;
  password_reset_url: string | null;
  email_confirmation_url: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type OriginDraft = {
  environment: string;
  origin: string;
  oauth_callback_url: string;
  password_reset_url: string;
  email_confirmation_url: string;
};

const emptyDraft: OriginDraft = {
  environment: 'local',
  origin: '',
  oauth_callback_url: '',
  password_reset_url: '',
  email_confirmation_url: '',
};

export function PlatformOriginsPage() {
  const { platform } = usePlatformContext();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [draftQuery, setDraftQuery] = useState(query);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<OriginDraft>(emptyDraft);
  const [fieldError, setFieldError] = useState('');
  const [createError, setCreateError] = useState<ResourceError | null>(null);
  const [creating, setCreating] = useState(false);
  const loadGeneration = useRef(0);

  useEffect(() => setDraftQuery(query), [query]);

  const load = useCallback(
    async (background = false) => {
      const generation = ++loadGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      setRefreshing(background);
      setRefreshError(null);
      if (!background) {
        setState('loading');
        setError(null);
      }
      try {
        const response = await adminAuthSession.request(
          `${resourcePath(platform.platform_id, '/origins')}${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<Origin[]>(response);
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          const nextError = resourceError(response, payload, 'Origin 列表');
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        setOrigins(payload.data);
        setState('success');
      } catch (caught) {
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError: ResourceError = {
          title: 'Origin 列表读取失败',
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
        if (generation === loadGeneration.current) setRefreshing(false);
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
    setDraft(emptyDraft);
    setFieldError('');
    setCreateError(null);
    setDialogOpen(true);
  }

  function validateDraft(): string | null {
    if (!draft.environment.trim()) return '请填写 environment。';
    if (!draft.origin.trim()) return '请填写 Origin。';
    if (!isHttpUrl(draft.origin)) return 'Origin 必须是 http 或 https URL。';
    for (const [label, value] of [
      ['OAuth callback URL', draft.oauth_callback_url],
      ['密码重置 URL', draft.password_reset_url],
      ['确认 URL', draft.email_confirmation_url],
    ] as const) {
      if (!value.trim()) return `请填写${label}。`;
      if (!isHttpUrl(value)) return `${label} 必须是 http 或 https URL。`;
    }
    return null;
  }

  async function createOrigin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateDraft();
    if (validation) {
      setFieldError(validation);
      return;
    }
    setCreating(true);
    setFieldError('');
    setCreateError(null);
    try {
      const response = await adminAuthSession.request(
        resourcePath(platform.platform_id, '/origins'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            environment: draft.environment.trim(),
            origin: draft.origin.trim(),
            oauth_callback_url: draft.oauth_callback_url.trim(),
            password_reset_url: draft.password_reset_url.trim(),
            email_confirmation_url: draft.email_confirmation_url.trim(),
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Origin>(response);
      if (!response.ok) {
        setCreateError(resourceError(response, payload, 'Origin 创建'));
        return;
      }
      setDialogOpen(false);
      await load(true);
    } catch (caught) {
      setCreateError({
        title: 'Origin 创建结果待确认',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setCreating(false);
    }
  }

  if (state === 'loading') {
    return (
      <section className="grid gap-5" data-test="platform-origins-loading">
        <AdminPageHeader
          title="Origins"
          description="平台的 Origin 与回调 URL 配置事实。"
        />
        <AsyncState state="loading" />
      </section>
    );
  }

  return (
    <section className="grid gap-5" data-test="platform-origins-page">
      <AdminPageHeader
        title="Origins"
        description="只登记服务端支持的 Origin 与回调地址；页面不会替你猜测或修正 URL，也不会提供合同未支持的编辑/删除按钮。"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={refreshing}
              data-test="platform-origins-refresh"
            >
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
            <Button
              size="sm"
              onClick={openCreate}
              data-test="platform-origin-open-create"
            >
              登记 Origin
            </Button>
          </div>
        }
      />
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
        <Alert variant="destructive" data-test="platform-origins-refresh-error">
          <AlertTitle>Origin 刷新未完成</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <SupportErrorId
              requestId={refreshError.requestId}
              technicalDetail={refreshError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}
      {createError ? (
        <Alert variant="destructive" data-test="platform-origin-create-error">
          <AlertTitle>{createError.title}</AlertTitle>
          <AlertDescription>
            {createError.description}
            <SupportErrorId
              requestId={createError.requestId}
              technicalDetail={createError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="panel gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>已登记地址</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              当前平台：<span className="font-mono">{platform.code}</span>
            </p>
          </div>
          <ResourceId value={platform.platform_id} />
        </div>
        <form className="flex gap-2" onSubmit={applyQuery}>
          <Label htmlFor="platform-origin-query" className="sr-only">
            搜索 Origin
          </Label>
          <Input
            id="platform-origin-query"
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="environment、origin 或 status"
            data-test="platform-origin-query"
          />
          <Button
            type="submit"
            variant="outline"
            data-test="platform-origin-query-submit"
          >
            查询
          </Button>
        </form>
        {state === 'success' && origins.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
            {query
              ? '当前搜索没有匹配 Origin。'
              : '当前平台还没有登记 Origin。'}
          </div>
        ) : null}
        {origins.length ? (
          <div className="grid gap-3" data-test="platform-origin-rows">
            {origins.map((item) => (
              <article
                key={item.origin_id}
                className="grid gap-3 rounded-xl border border-border/70 bg-card p-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start"
              >
                <StatusBadge
                  label={statusLabel(item.status)}
                  tone={statusTone(item.status)}
                  rawValue={item.status}
                />
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                      {item.environment}
                    </span>
                    <ResourceId value={item.origin_id} />
                  </div>
                  <p className="break-all text-sm font-medium text-foreground">
                    {item.origin}
                  </p>
                  <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>
                      <dt>OAuth callback</dt>
                      <dd className="m-0 break-all">
                        {item.oauth_callback_url ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>密码重置</dt>
                      <dd className="m-0 break-all">
                        {item.password_reset_url ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>确认 URL</dt>
                      <dd className="m-0 break-all">
                        {item.email_confirmation_url ?? '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
                <span className="text-xs text-muted-foreground">
                  只读配置事实
                </span>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-h-[min(44rem,calc(100svh-2rem))] overflow-y-auto"
          data-test="platform-origin-create-dialog"
        >
          <DialogHeader>
            <DialogTitle>登记 Origin</DialogTitle>
            <DialogDescription>
              字段会原样提交服务端；创建成功后重新读取当前平台列表。
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={createOrigin}>
            <OriginField
              id="origin-environment"
              label="environment"
              value={draft.environment}
              placeholder="local / preview / production"
              onChange={(value) => setDraft({ ...draft, environment: value })}
            />
            <OriginField
              id="origin-value"
              label="Origin"
              value={draft.origin}
              placeholder="https://console.example.com"
              onChange={(value) => setDraft({ ...draft, origin: value })}
            />
            <OriginField
              id="origin-oauth-callback"
              label="OAuth callback URL"
              value={draft.oauth_callback_url}
              placeholder="https://console.example.com/auth/callback"
              onChange={(value) =>
                setDraft({ ...draft, oauth_callback_url: value })
              }
            />
            <OriginField
              id="origin-password-reset"
              label="密码重置 URL"
              value={draft.password_reset_url}
              placeholder="https://console.example.com/auth/reset"
              onChange={(value) =>
                setDraft({ ...draft, password_reset_url: value })
              }
            />
            <OriginField
              id="origin-confirmation"
              label="确认 URL"
              value={draft.email_confirmation_url}
              placeholder="https://console.example.com/auth/confirm"
              onChange={(value) =>
                setDraft({ ...draft, email_confirmation_url: value })
              }
            />
            {fieldError ? (
              <p
                className="text-sm text-destructive"
                role="alert"
                data-test="platform-origin-field-error"
              >
                {fieldError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={creating}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={creating}
                data-test="platform-origin-create-submit"
              >
                {creating ? '登记中…' : '确认登记'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function OriginField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
