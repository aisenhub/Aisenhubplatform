'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '../../app/_lib/auth/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';
import { Textarea } from '@kit/ui/textarea';
import type { MutationState } from '@kit/ui/mutation-state';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import {
  formatUtc,
  isRecentMfaRequired,
  readApiPayload,
  resourceError,
  resourcePath,
  statusLabel,
  statusTone,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';

import {
  accountActionLabel,
  type AccountIntent,
  type AccountWorkbench,
} from './account-types';

type SupportMutationState =
  | 'idle'
  | 'pending'
  | 'success'
  | 'error'
  | 'unknown';

type SupportMutationFeedback = {
  state: SupportMutationState;
  error: ResourceError | null;
};

function metric(value: number | string | null | undefined): string {
  if (typeof value === 'number')
    return new Intl.NumberFormat('zh-CN').format(value);
  if (typeof value === 'string' && value.trim()) return value;
  return '0';
}

function textFact(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '—';
}

function tagsInput(tags: string[]): string {
  return tags.join(', ');
}

function parsedTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function AccountWorkbenchPage({ accountId }: { accountId: string }) {
  const { platform } = usePlatformContext();
  const [detail, setDetail] = useState<AccountWorkbench | null>(null);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tagsDraft, setTagsDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [supportFeedback, setSupportFeedback] =
    useState<SupportMutationFeedback>({
      state: 'idle',
      error: null,
    });
  const [intent, setIntent] = useState<AccountIntent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );

  const accountPath = useMemo(
    () =>
      resourcePath(
        platform.platform_id,
        `/accounts/${encodeURIComponent(accountId)}`,
      ),
    [accountId, platform.platform_id],
  );

  const load = useCallback(
    async (background = false) => {
      const epoch = adminAuthSession.getEpoch();
      if (background) setRefreshing(true);
      else {
        setState('loading');
        setError(null);
      }
      try {
        const response = await adminAuthSession.request(accountPath, {
          cache: 'no-store',
        });
        const payload = await readApiPayload<AccountWorkbench>(response);
        if (!adminAuthSession.isCurrentEpoch(epoch)) return;
        if (!response.ok || !payload?.data) {
          setError(resourceError(response, payload, 'Account 360'));
          if (!background) setState('error');
          return;
        }
        setDetail(payload.data);
        setTagsDraft(tagsInput(payload.data.tags ?? []));
        setState('success');
      } catch (caught) {
        if (!adminAuthSession.isCurrentEpoch(epoch)) return;
        setError({
          title: 'Account 360 读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
        if (!background) setState('error');
      } finally {
        setRefreshing(false);
      }
    },
    [accountPath],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function openAction(action: AccountIntent['action']) {
    if (!detail) return;
    setMutationState('confirm_required');
    setMutationError(null);
    setIntent({
      accountId: detail.platform_account_id,
      action,
      title: accountActionLabel(action),
      impact:
        action === 'close'
          ? '关闭不可逆，但不会冒充 Global Identity 隐私删除；支持历史按隐私生命周期单独最小化。'
          : '状态变更会要求近期 MFA，并把本次原因写入权威治理事件。',
      reversible: action !== 'close',
    });
  }

  async function executeAction(reason: string) {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    try {
      const response = await adminAuthSession.request(
        `${accountPath}/${intent.action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
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
        setMutationError(resourceError(response, payload, '账户治理操作'));
        return;
      }
      setMutationState(response.status === 202 ? 'accepted' : 'success');
      await load(true);
      setIntent(null);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新提交',
          description: '为避免重复治理，本次状态变更没有自动重放。',
          requestId: null,
          technicalDetail: 'SESSION_RECOVERY_REQUIRED',
        });
        return;
      }
      setMutationState('unknown_outcome');
      setMutationError({
        title: '账户治理结果待确认',
        description:
          '网络中断后没有自动重放。请先重新读取 Account 360 权威状态。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function checkUnknown() {
    await load(true);
    setMutationError({
      title: 'Account 360 已重新读取',
      description: '本次检查没有重新发送原治理动作。',
      requestId: null,
      technicalDetail: null,
    });
  }

  async function replaceTags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSupportFeedback({ state: 'pending', error: null });
    try {
      const response = await adminAuthSession.request(
        `${accountPath}/tags`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: parsedTags(tagsDraft) }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<{ tags?: string[] }>(response);
      if (!response.ok) {
        setSupportFeedback({
          state: 'error',
          error: resourceError(response, payload, '管理员标签'),
        });
        return;
      }
      setSupportFeedback({ state: 'success', error: null });
      await load(true);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setSupportFeedback({
          state: 'error',
          error: {
            title: '会话已恢复，请重新提交标签',
            description: '标签替换没有自动重放。',
            requestId: null,
            technicalDetail: 'SESSION_RECOVERY_REQUIRED',
          },
        });
        return;
      }
      setSupportFeedback({
        state: 'unknown',
        error: {
          title: '标签结果待确认',
          description:
            '网络中断后没有自动重放，请刷新 Account 360 判断权威标签集合。',
          requestId: null,
          technicalDetail: null,
        },
      });
    }
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!noteDraft.trim()) return;
    setSupportFeedback({ state: 'pending', error: null });
    try {
      const response = await adminAuthSession.request(
        `${accountPath}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: noteDraft.trim() }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Record<string, unknown>>(response);
      if (!response.ok) {
        setSupportFeedback({
          state: 'error',
          error: resourceError(response, payload, '管理员备注'),
        });
        return;
      }
      setNoteDraft('');
      setSupportFeedback({ state: 'success', error: null });
      await load(true);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setSupportFeedback({
          state: 'error',
          error: {
            title: '会话已恢复，请重新提交备注',
            description: '备注追加没有自动重放。',
            requestId: null,
            technicalDetail: 'SESSION_RECOVERY_REQUIRED',
          },
        });
        return;
      }
      setSupportFeedback({
        state: 'unknown',
        error: {
          title: '备注结果待确认',
          description:
            '网络中断后没有自动重放，请刷新 Account 360 检查备注时间线。',
          requestId: null,
          technicalDetail: null,
        },
      });
    }
  }

  if (state === 'loading') return <AsyncState state="loading" />;
  if (state === 'error' && error)
    return (
      <AsyncState
        state="error"
        title={error.title}
        description={error.description}
        requestId={error.requestId}
        technicalDetail={error.technicalDetail}
        onRetry={() => void load()}
      />
    );
  if (!detail) return null;

  const identityUserId = detail.identity?.user_id ?? detail.user_id;
  const billingLatest = detail.billing_latest ?? {};
  const closed = detail.status === 'closed';
  const suspended = detail.status === 'suspended';

  return (
    <section className="grid gap-5" data-test="account-workbench-page">
      <AdminPageHeader
        title={detail.display_name?.trim() || 'Account 360'}
        description="当前平台的权威账户运营视图。Global Identity 仅只读展示 email/UID，不在此管理密码、MFA 或全局删除。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/accounts`}
                />
              }
            >
              返回账户列表
            </Button>
            <Button
              variant="outline"
              onClick={() => void load(true)}
              disabled={refreshing}
              data-test="account-workbench-refresh"
            >
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
          </div>
        }
      />

      {error ? (
        <Alert variant="destructive">
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

      <section className="grid gap-4 lg:grid-cols-3">
        <article
          className="panel gap-3 lg:col-span-2"
          data-test="account-workbench-overview"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2>账户概览</h2>
            <StatusBadge
              label={statusLabel(detail.status)}
              tone={statusTone(detail.status)}
              rawValue={detail.status}
            />
          </div>
          <dl className="detail-list text-sm">
            <div>
              <dt>Platform Account ID</dt>
              <dd>
                <ResourceId value={detail.platform_account_id} />
              </dd>
            </div>
            <div>
              <dt>User ID</dt>
              <dd>
                {identityUserId ? (
                  <ResourceId value={identityUserId} />
                ) : (
                  '匿名账户'
                )}
              </dd>
            </div>
            <div>
              <dt>Global Identity email</dt>
              <dd>{detail.identity?.email ?? '未设置 / 已匿名化'}</dd>
            </div>
            <div>
              <dt>加入时间</dt>
              <dd>{formatUtc(detail.created_at)}</dd>
            </div>
            <div>
              <dt>激活时间</dt>
              <dd>{formatUtc(detail.activated_at)}</dd>
            </div>
            <div>
              <dt>暂停时间</dt>
              <dd>{formatUtc(detail.suspended_at)}</dd>
            </div>
            <div>
              <dt>关闭时间</dt>
              <dd>{formatUtc(detail.closed_at)}</dd>
            </div>
            <div>
              <dt>匿名化时间</dt>
              <dd>{formatUtc(detail.anonymized_at)}</dd>
            </div>
          </dl>
          {identityUserId ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  href={`/admin/accounts/${encodeURIComponent(identityUserId)}`}
                />
              }
              data-test="account-global-identity-link"
            >
              打开统一用户
            </Button>
          ) : null}
        </article>

        <article className="panel gap-3" data-test="account-workbench-actions">
          <h2>账户治理</h2>
          <p className="text-sm text-muted-foreground">
            高风险状态变更要求 reason + recent-MFA，未知结果不会自动重放。
          </p>
          {!closed ? (
            <Button
              variant="outline"
              onClick={() => openAction(suspended ? 'restore' : 'suspend')}
              data-test="account-workbench-toggle"
            >
              {suspended ? '恢复账户' : '暂停账户'}
            </Button>
          ) : null}
          {!closed ? (
            <Button
              variant="destructive"
              onClick={() => openAction('close')}
              data-test="account-workbench-close"
            >
              关闭账户
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              账户已关闭，不再提供状态写入。
            </p>
          )}
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="panel gap-3" data-test="account-workbench-profile">
          <h2>平台资料</h2>
          <dl className="detail-list text-sm">
            <div>
              <dt>显示名称</dt>
              <dd>{detail.display_name ?? '—'}</dd>
            </div>
            <div>
              <dt>Avatar URL</dt>
              <dd className="break-all">{detail.avatar_url ?? '—'}</dd>
            </div>
            <div>
              <dt>Locale</dt>
              <dd>{detail.locale ?? '—'}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{detail.timezone ?? '—'}</dd>
            </div>
          </dl>
          <div>
            <h3 className="text-sm font-medium">Bio</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {detail.bio ?? '—'}
            </p>
          </div>
        </article>

        <article
          className="panel gap-3"
          data-test="account-workbench-entitlement"
        >
          <h2>订阅与权益</h2>
          <dl className="detail-list text-sm">
            <div>
              <dt>Plan</dt>
              <dd>{detail.plan_name ?? detail.plan_code ?? '无有效方案'}</dd>
            </div>
            <div>
              <dt>Plan kind</dt>
              <dd>{detail.plan_kind ?? '—'}</dd>
            </div>
            <div>
              <dt>Subscription</dt>
              <dd>{detail.subscription_status ?? 'none'}</dd>
            </div>
            <div>
              <dt>开始时间</dt>
              <dd>{formatUtc(detail.subscription_started_at)}</dd>
            </div>
            <div>
              <dt>当前周期结束</dt>
              <dd>{formatUtc(detail.current_period_end)}</dd>
            </div>
            <div>
              <dt>下一次转换</dt>
              <dd>{formatUtc(detail.next_transition_at)}</dd>
            </div>
          </dl>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/subscriptions?account=${encodeURIComponent(detail.platform_account_id)}`}
              />
            }
          >
            打开订阅工作台
          </Button>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="panel gap-3" data-test="account-workbench-billing">
          <h2>Billing 摘要</h2>
          <p className="text-2xl font-semibold">
            {metric(detail.billing_order_count)}
          </p>
          <p className="text-sm text-muted-foreground">
            需关注 {metric(detail.billing_attention_count)} 单
          </p>
          <dl className="detail-list text-xs">
            <div>
              <dt>最近订单</dt>
              <dd>{textFact(billingLatest.order_id)}</dd>
            </div>
            <div>
              <dt>验证</dt>
              <dd>{textFact(billingLatest.verification_status)}</dd>
            </div>
            <div>
              <dt>权益</dt>
              <dd>{textFact(billingLatest.entitlement_status)}</dd>
            </div>
            <div>
              <dt>结算</dt>
              <dd>{textFact(billingLatest.settlement_state)}</dd>
            </div>
          </dl>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/billing?platform_account_id=${encodeURIComponent(detail.platform_account_id)}`}
              />
            }
          >
            打开 Billing
          </Button>
        </article>

        <article className="panel gap-3" data-test="account-workbench-config">
          <h2>配置资源摘要</h2>
          <p className="text-sm">
            Active {metric(detail.config_active_count)} · Gallery{' '}
            {metric(detail.config_published_count)}
          </p>
          <p className="text-sm text-muted-foreground">
            待审核 {metric(detail.config_pending_review_count)}
          </p>
          <p className="text-xs text-muted-foreground">
            最近更新 {formatUtc(detail.config_latest_updated_at)}
          </p>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/files`}
              />
            }
          >
            打开配置资源
          </Button>
        </article>

        <article className="panel gap-3" data-test="account-workbench-feedback">
          <h2>用户反馈摘要</h2>
          <p className="text-sm">有效反馈 {metric(detail.feedback_count)}</p>
          <p className="text-sm text-muted-foreground">
            待处理 {metric(detail.feedback_open_count)}
          </p>
          <p className="text-xs text-muted-foreground">
            最近提交 {formatUtc(detail.feedback_latest_submitted_at)}
          </p>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/feedback${identityUserId ? `?user=${encodeURIComponent(identityUserId)}` : ''}`}
              />
            }
          >
            打开用户反馈
          </Button>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="panel gap-4" data-test="account-workbench-support">
          <div>
            <h2>管理员标签与备注</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              与用户 Profile 分离；备注正文不会复制到通用 Audit metadata。
            </p>
          </div>
          {supportFeedback.error ? (
            <Alert
              variant={
                supportFeedback.state === 'unknown' ? 'default' : 'destructive'
              }
            >
              <AlertTitle>{supportFeedback.error.title}</AlertTitle>
              <AlertDescription>
                {supportFeedback.error.description}
                <SupportErrorId
                  requestId={supportFeedback.error.requestId}
                  technicalDetail={supportFeedback.error.technicalDetail}
                />
              </AlertDescription>
            </Alert>
          ) : supportFeedback.state === 'success' ? (
            <Alert>
              <AlertTitle>支持信息已更新</AlertTitle>
              <AlertDescription>
                Account 360 已重新读取权威值。
              </AlertDescription>
            </Alert>
          ) : null}
          <form className="grid gap-2" onSubmit={replaceTags}>
            <Label htmlFor="account-tags">管理员标签</Label>
            <Input
              id="account-tags"
              value={tagsDraft}
              onChange={(event) => setTagsDraft(event.target.value)}
              maxLength={659}
              placeholder="逗号分隔，最多 20 个；每个 1–32 字符"
              data-test="account-tags-input"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={supportFeedback.state === 'pending'}
              data-test="account-tags-save"
            >
              替换标签集合
            </Button>
          </form>
          <form className="grid gap-2" onSubmit={addNote}>
            <Label htmlFor="account-note">追加内部备注</Label>
            <Textarea
              id="account-note"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              maxLength={2000}
              placeholder="仅 Admin 可读；Global Delete/retention 会按隐私规则最小化"
              data-test="account-note-input"
            />
            <Button
              type="submit"
              disabled={
                !noteDraft.trim() || supportFeedback.state === 'pending'
              }
              data-test="account-note-add"
            >
              追加备注
            </Button>
          </form>
          {detail.notes.length ? (
            <div className="grid gap-2" data-test="account-notes-timeline">
              {detail.notes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-lg border border-border/70 p-3"
                >
                  <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatUtc(note.created_at)} · Admin{' '}
                    {note.created_by ?? 'unknown'}
                    {note.redacted_at
                      ? ` · 已于 ${formatUtc(note.redacted_at)} 脱敏`
                      : ''}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂无内部备注。</p>
          )}
        </article>

        <article
          className="panel gap-4"
          data-test="account-governance-timeline"
        >
          <div>
            <h2>账户治理时间线</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              原因保存在受保护治理事件中；通用 Audit 仅关联事件 ID。
            </p>
          </div>
          {detail.governance_events.length ? (
            <div className="grid gap-2">
              {detail.governance_events.map((event) => (
                <article
                  key={event.id}
                  className="rounded-lg border border-border/70 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge
                      label={event.action}
                      tone={
                        event.action === 'close'
                          ? 'danger'
                          : event.action === 'suspend'
                            ? 'warning'
                            : 'success'
                      }
                      rawValue={event.action}
                    />
                    <span className="text-xs text-muted-foreground">
                      {formatUtc(event.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {event.reason}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Admin {event.actor_admin_user_id ?? 'unknown'}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂无治理事件。</p>
          )}
        </article>
      </section>

      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && mutationState !== 'pending') {
              setIntent(null);
              setMutationState('confirm_required');
              setMutationError(null);
            }
          }}
          title={intent.title}
          targetIdentity={intent.accountId}
          impact={intent.impact}
          reversible={intent.reversible}
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
          onCheckUnknown={
            mutationState === 'unknown_outcome'
              ? () => void checkUnknown()
              : undefined
          }
          onConfirm={(reason) => void executeAction(reason)}
        />
      ) : null}
    </section>
  );
}
