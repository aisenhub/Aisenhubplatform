'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceId } from '@kit/ui/resource-id';
import { Textarea } from '@kit/ui/textarea';

import {
  ConsumerLogoutButton,
  ConsumerShell,
} from '../../components/consumer-shell';
import {
  ConsumerNotice,
  ConsumerRemoteStateView,
  ConsumerStatus,
  ConsumerStatusBadge,
  errorFromException,
  errorFromResponse,
  type ConsumerError,
  type ConsumerRemoteState,
} from '../../components/consumer-state';
import {
  consumerAuthSession,
  useConsumerSessionSnapshot,
} from '../_lib/auth-session';

type Profile = {
  display_name: string | null;
  bio: string | null;
  locale: string | null;
  timezone: string | null;
  row_version: number;
};

type Preferences = {
  preferences: Record<string, unknown>;
  row_version: number;
};

type Principal = {
  user_id?: string;
  platform_id?: string;
  platform_account_id?: string | null;
  platform_status?: string;
  account_status?: string;
};

type SensitiveIntent = 'close' | 'delete';
type SectionLoad = {
  state: ConsumerRemoteState;
  error: ConsumerError | null;
  refreshError: ConsumerError | null;
};

const initialLoad: SectionLoad = {
  state: 'loading',
  error: null,
  refreshError: null,
};

function accountStatus(value: string | undefined) {
  switch (value) {
    case 'active':
      return { label: '正常', tone: 'success' as const };
    case 'suspended':
      return { label: '已暂停', tone: 'warning' as const };
    case 'closed':
      return { label: '已关闭', tone: 'danger' as const };
    case 'not_activated':
      return { label: '待激活', tone: 'info' as const };
    default:
      return { label: value ?? '未确认', tone: 'unknown' as const };
  }
}

function validPreferences(value: unknown): value is Record<string, unknown> {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

export default function AccountPage() {
  const sessionSnapshot = useConsumerSessionSnapshot();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    displayName: '',
    bio: '',
  });
  const [preferenceText, setPreferenceText] = useState('{}');
  const [profileLoad, setProfileLoad] = useState<SectionLoad>(initialLoad);
  const [preferenceLoad, setPreferenceLoad] =
    useState<SectionLoad>(initialLoad);
  const [profileFieldError, setProfileFieldError] = useState('');
  const [preferenceFieldError, setPreferenceFieldError] = useState('');
  const [profileConflict, setProfileConflict] = useState(false);
  const [preferenceConflict, setPreferenceConflict] = useState(false);
  const [profilePending, setProfilePending] = useState(false);
  const [preferencePending, setPreferencePending] = useState(false);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [principalLoad, setPrincipalLoad] = useState<SectionLoad>(initialLoad);
  const [intent, setIntent] = useState<SensitiveIntent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ConsumerError | null>(
    null,
  );
  const profileGeneration = useRef(0);
  const preferenceGeneration = useRef(0);
  const principalGeneration = useRef(0);

  const loadProfile = useCallback(async (preserveDraft = false) => {
    const generation = ++profileGeneration.current;
    const epoch = consumerAuthSession.getEpoch();
    setProfileLoad((current) => ({
      ...current,
      state: current.state === 'success' ? 'success' : 'loading',
      error: null,
      refreshError: null,
    }));
    try {
      const response = await consumerAuthSession.request('/api/v1/profile', {
        cache: 'no-store',
      });
      const payload = (
        response.ok ? await response.json().catch(() => null) : null
      ) as {
        data?: Profile;
      } | null;
      if (
        generation !== profileGeneration.current ||
        !consumerAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (!response.ok || !payload?.data) {
        const nextError = await errorFromResponse(response, '资料');
        setProfileLoad((current) =>
          current.state === 'success'
            ? { ...current, refreshError: nextError }
            : {
                state: nextError.title === '需要登录' ? 'access' : 'error',
                error: nextError,
                refreshError: null,
              },
        );
        return;
      }
      setProfile(payload.data);
      if (!preserveDraft) {
        setProfileDraft({
          displayName: payload.data.display_name ?? '',
          bio: payload.data.bio ?? '',
        });
      }
      setProfileLoad({ state: 'success', error: null, refreshError: null });
    } catch (caught) {
      if (
        generation !== profileGeneration.current ||
        !consumerAuthSession.isCurrentEpoch(epoch)
      )
        return;
      const nextError = errorFromException('资料', caught);
      setProfileLoad((current) =>
        current.state === 'success'
          ? { ...current, refreshError: nextError }
          : { state: 'error', error: nextError, refreshError: null },
      );
    }
  }, []);

  const loadPreferences = useCallback(async (preserveDraft = false) => {
    const generation = ++preferenceGeneration.current;
    const epoch = consumerAuthSession.getEpoch();
    setPreferenceLoad((current) => ({
      ...current,
      state: current.state === 'success' ? 'success' : 'loading',
      error: null,
      refreshError: null,
    }));
    try {
      const response = await consumerAuthSession.request(
        '/api/v1/preferences',
        {
          cache: 'no-store',
        },
      );
      const payload = (
        response.ok ? await response.json().catch(() => null) : null
      ) as {
        data?: Preferences;
      } | null;
      if (
        generation !== preferenceGeneration.current ||
        !consumerAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (!response.ok || !payload?.data) {
        const nextError = await errorFromResponse(response, '偏好');
        setPreferenceLoad((current) =>
          current.state === 'success'
            ? { ...current, refreshError: nextError }
            : {
                state: nextError.title === '需要登录' ? 'access' : 'error',
                error: nextError,
                refreshError: null,
              },
        );
        return;
      }
      setPreferences(payload.data);
      if (!preserveDraft)
        setPreferenceText(JSON.stringify(payload.data.preferences, null, 2));
      setPreferenceLoad({ state: 'success', error: null, refreshError: null });
    } catch (caught) {
      if (
        generation !== preferenceGeneration.current ||
        !consumerAuthSession.isCurrentEpoch(epoch)
      )
        return;
      const nextError = errorFromException('偏好', caught);
      setPreferenceLoad((current) =>
        current.state === 'success'
          ? { ...current, refreshError: nextError }
          : { state: 'error', error: nextError, refreshError: null },
      );
    }
  }, []);

  const loadPrincipal = useCallback(async () => {
    const generation = ++principalGeneration.current;
    const epoch = consumerAuthSession.getEpoch();
    setPrincipalLoad((current) => ({
      ...current,
      state: current.state === 'success' ? 'success' : 'loading',
      error: null,
      refreshError: null,
    }));
    try {
      const response = await consumerAuthSession.request(
        '/api/v1/account/principal',
        { cache: 'no-store' },
      );
      const payload = (
        response.ok ? await response.json().catch(() => null) : null
      ) as {
        data?: Principal;
      } | null;
      if (
        generation !== principalGeneration.current ||
        !consumerAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (!response.ok || !payload?.data) {
        const nextError = await errorFromResponse(response, '账户状态');
        setPrincipalLoad({
          state: nextError.title === '需要登录' ? 'access' : 'error',
          error: nextError,
          refreshError: null,
        });
        return;
      }
      setPrincipal(payload.data);
      setPrincipalLoad({ state: 'success', error: null, refreshError: null });
    } catch (caught) {
      if (
        generation !== principalGeneration.current ||
        !consumerAuthSession.isCurrentEpoch(epoch)
      )
        return;
      setPrincipalLoad({
        state: 'error',
        error: errorFromException('账户状态', caught),
        refreshError: null,
      });
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadPreferences();
    void loadPrincipal();
  }, [loadPreferences, loadPrincipal, loadProfile]);

  useEffect(() => {
    if (
      !sessionSnapshot.resolved ||
      !['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    )
      return;
    setProfile(null);
    setPreferences(null);
    setPrincipal(null);
    setProfileDraft({ displayName: '', bio: '' });
    setPreferenceText('{}');
    setProfileLoad(initialLoad);
    setPreferenceLoad(initialLoad);
    setPrincipalLoad(initialLoad);
    setIntent(null);
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || profilePending) return;
    if (profileDraft.displayName.length > 120) {
      setProfileFieldError('显示名称不能超过 120 个字符。');
      return;
    }
    if (profileDraft.bio.length > 2000) {
      setProfileFieldError('简介不能超过 2000 个字符。');
      return;
    }
    setProfileFieldError('');
    setProfilePending(true);
    try {
      const response = await consumerAuthSession.request(
        '/api/v1/profile',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"${profile.row_version}"`,
          },
          body: JSON.stringify({
            display_name: profileDraft.displayName,
            bio: profileDraft.bio,
          }),
        },
        { replay: 'never' },
      );
      const payload = (
        response.ok ? await response.json().catch(() => null) : null
      ) as {
        data?: Profile;
      } | null;
      if (!response.ok || !payload?.data) {
        const nextError = await errorFromResponse(response, '资料保存');
        setProfileLoad((current) => ({ ...current, refreshError: nextError }));
        if (response.status === 412 || response.status === 428)
          setProfileConflict(true);
        return;
      }
      setProfile(payload.data);
      setProfileDraft({
        displayName: payload.data.display_name ?? '',
        bio: payload.data.bio ?? '',
      });
      setProfileConflict(false);
      setProfileLoad({ state: 'success', error: null, refreshError: null });
    } catch (caught) {
      setProfileLoad((current) => ({
        ...current,
        refreshError: errorFromException('资料保存', caught),
      }));
    } finally {
      setProfilePending(false);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preferences || preferencePending) return;
    let value: unknown;
    try {
      value = JSON.parse(preferenceText);
    } catch {
      setPreferenceFieldError('偏好必须是有效的 JSON 对象。');
      return;
    }
    if (!validPreferences(value)) {
      setPreferenceFieldError('偏好必须是 JSON 对象，不能是数组或其他类型。');
      return;
    }
    setPreferenceFieldError('');
    setPreferencePending(true);
    try {
      const response = await consumerAuthSession.request(
        '/api/v1/preferences',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"${preferences.row_version}"`,
          },
          body: JSON.stringify(value),
        },
        { replay: 'never' },
      );
      const payload = (
        response.ok ? await response.json().catch(() => null) : null
      ) as {
        data?: Preferences;
      } | null;
      if (!response.ok || !payload?.data) {
        const nextError = await errorFromResponse(response, '偏好保存');
        setPreferenceLoad((current) => ({
          ...current,
          refreshError: nextError,
        }));
        if (response.status === 412 || response.status === 428)
          setPreferenceConflict(true);
        return;
      }
      setPreferences(payload.data);
      setPreferenceText(JSON.stringify(payload.data.preferences, null, 2));
      setPreferenceConflict(false);
      setPreferenceLoad({ state: 'success', error: null, refreshError: null });
    } catch (caught) {
      setPreferenceLoad((current) => ({
        ...current,
        refreshError: errorFromException('偏好保存', caught),
      }));
    } finally {
      setPreferencePending(false);
    }
  }

  function openSensitive(nextIntent: SensitiveIntent) {
    setIntent(nextIntent);
    setMutationState('confirm_required');
    setMutationError(null);
  }

  function closeSensitive() {
    if (mutationState === 'pending') return;
    setIntent(null);
    setMutationState('confirm_required');
    setMutationError(null);
  }

  async function submitSensitive() {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    try {
      const response = await consumerAuthSession.request(
        intent === 'close'
          ? '/api/v1/account/close'
          : '/api/v1/identity/delete-request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
        { replay: 'never' },
      );
      if (!response.ok) {
        const nextError = await errorFromResponse(response, '敏感账户操作');
        if (
          response.status === 403 &&
          nextError.technicalDetail === 'RECENT_MFA_REQUIRED'
        ) {
          setMutationState('step_up_required');
          setMutationError(nextError);
          return;
        }
        setMutationState('failure');
        setMutationError(nextError);
        return;
      }
      setMutationState(response.status === 202 ? 'accepted' : 'success');
      await loadPrincipal();
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新提交',
          description: '为避免重复提交，本次敏感操作没有自动重放。',
          requestId: null,
          technicalDetail: null,
        });
        return;
      }
      setMutationState('unknown_outcome');
      setMutationError({
        title: '结果待确认',
        description:
          '网络在服务端响应前中断。请先检查账户状态，不要立即重新提交。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function checkUnknown() {
    if (!intent) return;
    try {
      const response = await consumerAuthSession.request(
        '/api/v1/account/principal',
        { cache: 'no-store' },
      );
      const payload = (
        response.ok ? await response.json().catch(() => null) : null
      ) as {
        data?: Principal;
      } | null;
      if (!response.ok || !payload?.data) {
        setMutationError(await errorFromResponse(response, '账户状态检查'));
        return;
      }
      setPrincipal(payload.data);
      if (intent === 'close' && payload.data.account_status === 'closed') {
        setMutationState('success');
        setMutationError({
          title: '账户状态已确认',
          description: '服务端已确认当前平台账户关闭；页面没有重复提交。',
          requestId: null,
          technicalDetail: null,
        });
        return;
      }
      setMutationError({
        title: '结果仍待确认',
        description:
          intent === 'delete'
            ? '当前合同没有独立的全局删除状态读取接口，页面不会用账户状态猜测删除请求结果。'
            : '当前账户状态还不能证明关闭请求已完成；页面不会重复提交。',
        requestId: null,
        technicalDetail: null,
      });
    } catch (caught) {
      setMutationError(errorFromException('账户状态检查', caught));
    }
  }

  const currentStatus = accountStatus(principal?.account_status);
  const sensitiveTarget =
    principal?.platform_account_id ?? principal?.user_id ?? '当前账户';

  return (
    <ConsumerShell
      eyebrow="Account workspace"
      title="账户设置"
      description="分别管理资料、偏好与安全操作。草稿不会被新版本静默覆盖，敏感操作必须经过确认和近期认证。"
      headerActions={<ConsumerLogoutButton />}
    >
      <section className="consumer-stat-grid" aria-label="账户状态摘要">
        <div className="consumer-stat">
          <span className="consumer-stat-label">账户状态</span>
          <span className="consumer-stat-value">
            {principalLoad.state === 'success' ? currentStatus.label : '—'}
          </span>
          {principalLoad.state === 'success' ? (
            <ConsumerStatusBadge
              label={currentStatus.label}
              tone={currentStatus.tone}
              rawValue={principal?.account_status}
            />
          ) : null}
        </div>
        <div className="consumer-stat">
          <span className="consumer-stat-label">平台</span>
          <span className="consumer-stat-value text-base">
            {principal?.platform_status ?? '—'}
          </span>
          <span className="consumer-code">
            {principal?.platform_id ?? '登录后读取'}
          </span>
        </div>
        <div className="consumer-stat">
          <span className="consumer-stat-label">版本控制</span>
          <span className="consumer-stat-value text-base">If-Match</span>
          <span className="consumer-help">保存时校验 row_version</span>
        </div>
      </section>

      {principalLoad.state === 'error' && principalLoad.error ? (
        <ConsumerNotice
          title={principalLoad.error.title}
          description={principalLoad.error.description}
          tone="danger"
          requestId={principalLoad.error.requestId}
          technicalDetail={principalLoad.error.technicalDetail}
          action={<Button onClick={() => void loadPrincipal()}>重试</Button>}
        />
      ) : null}

      <div className="consumer-grid-two">
        <section className="consumer-card" id="profile">
          <div className="consumer-card-header">
            <div>
              <h2>资料</h2>
              <p className="consumer-card-description">
                仅保存允许编辑的资料字段。
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadProfile(true)}
            >
              读取最新
            </Button>
          </div>
          {profileLoad.refreshError ? (
            <ConsumerNotice
              title={profileConflict ? '资料版本冲突' : '资料可能已过期'}
              description={
                profileConflict
                  ? '服务端版本已经变化。请读取最新资料进行对比；当前草稿仍保留，页面不会静默覆盖。'
                  : profileLoad.refreshError.description
              }
              tone="warning"
              requestId={profileLoad.refreshError.requestId}
              technicalDetail={profileLoad.refreshError.technicalDetail}
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadProfile(true)}
                >
                  读取最新资料
                </Button>
              }
            />
          ) : null}
          {profileLoad.state !== 'success' ? (
            <ConsumerRemoteStateView
              state={profileLoad.state}
              error={profileLoad.error}
              onRetry={() => void loadProfile()}
            />
          ) : (
            <form className="consumer-form" onSubmit={saveProfile}>
              <div className="consumer-field">
                <Label htmlFor="display-name">显示名称</Label>
                <Input
                  id="display-name"
                  value={profileDraft.displayName}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  maxLength={120}
                />
              </div>
              <div className="consumer-field">
                <Label htmlFor="bio">简介</Label>
                <Textarea
                  id="bio"
                  value={profileDraft.bio}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      bio: event.target.value,
                    }))
                  }
                  rows={5}
                  maxLength={2000}
                />
              </div>
              {profileFieldError ? (
                <p className="text-sm text-destructive" role="alert">
                  {profileFieldError}
                </p>
              ) : null}
              {profileConflict && profile ? (
                <p className="consumer-help">
                  最新服务端版本：{profile.row_version}
                  。你的草稿仍保留，请对比后再保存。
                </p>
              ) : null}
              <div className="consumer-actions">
                <Button type="submit" disabled={profilePending}>
                  {profilePending ? '保存中…' : '保存资料'}
                </Button>
                {profilePending ? (
                  <ConsumerStatus busy>正在保存资料…</ConsumerStatus>
                ) : null}
              </div>
            </form>
          )}
        </section>

        <section className="consumer-card" id="preferences-panel">
          <div className="consumer-card-header">
            <div>
              <h2>偏好</h2>
              <p className="consumer-card-description">
                当前 schema 仍使用 JSON Merge Patch；偏好不参与授权。
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadPreferences(true)}
            >
              读取最新
            </Button>
          </div>
          {preferenceLoad.refreshError ? (
            <ConsumerNotice
              title={preferenceConflict ? '偏好版本冲突' : '偏好可能已过期'}
              description={
                preferenceConflict
                  ? '服务端版本已经变化。请读取最新偏好进行对比；当前 JSON 草稿仍保留。'
                  : preferenceLoad.refreshError.description
              }
              tone="warning"
              requestId={preferenceLoad.refreshError.requestId}
              technicalDetail={preferenceLoad.refreshError.technicalDetail}
              action={
                <Button onClick={() => void loadPreferences(true)}>
                  读取最新偏好
                </Button>
              }
            />
          ) : null}
          {preferenceLoad.state !== 'success' ? (
            <ConsumerRemoteStateView
              state={preferenceLoad.state}
              error={preferenceLoad.error}
              onRetry={() => void loadPreferences()}
            />
          ) : (
            <form className="consumer-form" onSubmit={savePreferences}>
              <div className="consumer-field">
                <Label htmlFor="preferences-json">JSON Merge Patch</Label>
                <Textarea
                  id="preferences-json"
                  value={preferenceText}
                  onChange={(event) => setPreferenceText(event.target.value)}
                  rows={9}
                  spellCheck={false}
                  aria-describedby="preferences-help"
                />
                <span id="preferences-help" className="consumer-field-hint">
                  null 会删除键；提交前会验证必须是对象。
                </span>
              </div>
              {preferenceFieldError ? (
                <p className="text-sm text-destructive" role="alert">
                  {preferenceFieldError}
                </p>
              ) : null}
              {preferenceConflict && preferences ? (
                <p className="consumer-help">
                  最新服务端版本：{preferences.row_version}。你的 JSON
                  草稿仍保留，请对比后再保存。
                </p>
              ) : null}
              <div className="consumer-actions">
                <Button type="submit" disabled={preferencePending}>
                  {preferencePending ? '保存中…' : '保存偏好'}
                </Button>
                {preferencePending ? (
                  <ConsumerStatus busy>正在保存偏好…</ConsumerStatus>
                ) : null}
              </div>
            </form>
          )}
        </section>
      </div>

      <section className="consumer-card" id="security">
        <div className="consumer-card-header">
          <div>
            <h2>安全操作</h2>
            <p className="consumer-card-description">
              敏感操作先确认，再按服务端要求完成近期认证；token_hash
              只在内存中短暂存在。
            </p>
          </div>
          {principal?.user_id ? <ResourceId value={principal.user_id} /> : null}
        </div>
        {principalLoad.refreshError ? (
          <ConsumerNotice
            title="账户状态可能已过期"
            description={principalLoad.refreshError.description}
            tone="warning"
            requestId={principalLoad.refreshError.requestId}
            technicalDetail={principalLoad.refreshError.technicalDetail}
          />
        ) : null}
        <div className="consumer-actions">
          <Button
            type="button"
            variant="destructive"
            onClick={() => openSensitive('close')}
            disabled={principal?.account_status === 'closed'}
          >
            关闭当前账户
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => openSensitive('delete')}
          >
            提交全局删除请求
          </Button>
        </div>
        <p className="consumer-help">
          关闭账户会改变当前平台账户状态；全局删除请求会进入服务端异步流程，不会在页面上宣称立即完成。
        </p>
      </section>

      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open) closeSensitive();
          }}
          title={intent === 'close' ? '关闭当前平台账户' : '提交全局删除请求'}
          targetIdentity={sensitiveTarget}
          impact={
            intent === 'close'
              ? '当前平台账户将进入 closed 状态；已发生的账户变更不会因为关闭窗口而撤销。'
              : '删除请求会进入服务端异步流程；页面不会把受理误显示为删除完成。'
          }
          reversible={false}
          state={mutationState}
          error={mutationError}
          stepUpContent={
            mutationState === 'step_up_required' ? (
              <ConsumerReauthPanel
                onVerified={() => {
                  setMutationState('confirm_required');
                  setMutationError(null);
                }}
              />
            ) : null
          }
          onStepUpVerified={() => setMutationState('confirm_required')}
          onCheckUnknown={
            mutationState === 'unknown_outcome' ? checkUnknown : undefined
          }
          onConfirm={() => void submitSensitive()}
        />
      ) : null}
    </ConsumerShell>
  );
}

function ConsumerReauthPanel({ onVerified }: { onVerified: () => void }) {
  const [tokenHash, setTokenHash] = useState('');
  const [state, setState] = useState<
    'idle' | 'sending' | 'sent' | 'verifying' | 'error'
  >('idle');
  const [error, setError] = useState<ConsumerError | null>(null);

  async function send() {
    setState('sending');
    setError(null);
    try {
      const response = await consumerAuthSession.request(
        '/api/auth/reauth/start',
        { method: 'POST' },
        { replay: 'never' },
      );
      if (!response.ok) {
        setError(await errorFromResponse(response, '近期认证'));
        setState('error');
        return;
      }
      setState('sent');
    } catch (caught) {
      setError(errorFromException('近期认证', caught));
      setState('error');
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tokenHash.trim()) return;
    setState('verifying');
    setError(null);
    try {
      const response = await consumerAuthSession.request(
        '/api/auth/reauth/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_hash: tokenHash }),
        },
        { replay: 'never' },
      );
      if (!response.ok) {
        setError(await errorFromResponse(response, '近期认证'));
        setState('error');
        return;
      }
      setTokenHash('');
      setState('sent');
      onVerified();
    } catch (caught) {
      setError(errorFromException('近期认证', caught));
      setState('error');
    }
  }

  return (
    <div className="consumer-card consumer-card-muted">
      <p className="consumer-help">
        {state === 'sent'
          ? '验证完成。请回到确认窗口，手动再次提交原操作。'
          : '发送独立验证邮件后，粘贴邮件中的 token_hash；验证成功不会自动重放原操作。'}
      </p>
      {error ? (
        <ConsumerNotice
          title={error.title}
          description={error.description}
          tone="danger"
          requestId={error.requestId}
          technicalDetail={error.technicalDetail}
        />
      ) : null}
      <div className="consumer-actions">
        <Button
          type="button"
          variant="outline"
          onClick={() => void send()}
          disabled={state === 'sending' || state === 'verifying'}
        >
          {state === 'sending' ? '发送中…' : '发送验证邮件'}
        </Button>
      </div>
      <form className="consumer-form" onSubmit={verify}>
        <div className="consumer-field">
          <Label htmlFor="consumer-reauth-token">邮件 token_hash</Label>
          <Input
            id="consumer-reauth-token"
            value={tokenHash}
            onChange={(event) => setTokenHash(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="粘贴 token_hash"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={!tokenHash || state === 'verifying'}
        >
          {state === 'verifying' ? '验证中…' : '验证并回到确认'}
        </Button>
      </form>
    </div>
  );
}
