'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { createBrowserSupabaseClient } from '@kit/account-auth-nextjs/browser';

import { ConsumerShell } from '../../components/consumer-shell';

type VerificationTarget = 'email' | 'phone';

type Profile = {
  display_name: string | null;
  bio: string | null;
  row_version: number;
};

type Preferences = {
  preferences: Record<string, unknown>;
  row_version: number;
};

type SensitiveAction = {
  label: string;
  path: '/api/v1/account/close' | '/api/v1/identity/delete-request';
};

type ApiErrorPayload = { error?: { code?: string } };

const OTP_COUNTDOWN_SECONDS = 60;

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) return null;

  try {
    return createBrowserSupabaseClient({ url, publishableKey });
  } catch {
    return null;
  }
}

const supabase = createSupabaseClient();

function normalizePhone(value: string) {
  const compact = value.replace(/[\s()-]/g, '');

  if (/^1[3-9]\d{9}$/u.test(compact)) return `+86${compact}`;
  if (/^\+[1-9]\d{7,14}$/u.test(compact)) return compact;

  return null;
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) return value;

  return `${localPart.slice(0, 2)}***@${domain}`;
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/gu, '');
  if (digits.length < 7) return value;

  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function authErrorMessage(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? '';

  if (message.includes('rate limit') || message.includes('too many')) {
    return '请求过于频繁，请稍后再试。';
  }
  if (message.includes('same') || message.includes('already')) {
    return '这个账号已经绑定，或没有发生变化。';
  }
  if (message.includes('invalid') || message.includes('expired')) {
    return '验证码无效或已过期，请重新获取。';
  }
  if (message.includes('password')) return '旧密码校验失败，请检查后重试。';

  return 'Supabase 验证失败，请检查账户配置后重试。';
}

function csrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const value = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('aisenhub-consumer-csrf='))
    ?.slice('aisenhub-consumer-csrf='.length);
  return value ? decodeURIComponent(value) : null;
}

async function accountApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const csrf = csrfToken();
  if (csrf) headers.set('x-csrf-token', csrf);
  if (init.body && !headers.has('content-type'))
    headers.set('content-type', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('AUTHORIZATION_UNAVAILABLE');
  }
  const payload = (await response.json().catch(() => null)) as
    | { data?: T }
    | ApiErrorPayload
    | null;
  if (!response.ok) {
    throw new Error(
      (payload && 'error' in payload ? payload.error?.code : undefined) ??
        'AUTHORIZATION_UNAVAILABLE',
    );
  }
  if (!payload || !('data' in payload) || payload.data === undefined)
    throw new Error('AUTHORIZATION_UNAVAILABLE');
  return payload.data;
}

function accountErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'UNAUTHORIZED' || code === 'ACCOUNT_NOT_ACTIVATED')
    return '请先登录并激活工作区后再管理账户资料。';
  if (code === 'PRECONDITION_FAILED')
    return '资料版本已变化，请刷新后再保存，避免覆盖其他设备的修改。';
  if (code === 'RECENT_MFA_REQUIRED')
    return '这项操作需要近期认证，请先完成邮件验证。';
  return '账户服务暂时不可用，请稍后重试。';
}

export default function AccountPage() {
  const [name, setName] = useState('林默');
  const [bio, setBio] = useState('');
  const [profileVersion, setProfileVersion] = useState<number | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [preferenceText, setPreferenceText] = useState('{}');
  const [isLoadingAccountData, setIsLoadingAccountData] = useState(true);
  const [accountDataError, setAccountDataError] = useState('');
  const [preferencesMessage, setPreferencesMessage] = useState('');
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [currentPhone, setCurrentPhone] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [verificationTarget, setVerificationTarget] =
    useState<VerificationTarget | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationExpiresAt, setVerificationExpiresAt] = useState<
    number | null
  >(null);
  const [verificationRemaining, setVerificationRemaining] = useState(0);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [tokenHash, setTokenHash] = useState('');
  const [reauthMessage, setReauthMessage] = useState('');
  const [isSendingReauth, setIsSendingReauth] = useState(false);
  const [isVerifyingReauth, setIsVerifyingReauth] = useState(false);
  const [pendingSensitiveAction, setPendingSensitiveAction] =
    useState<SensitiveAction | null>(null);
  const [sensitiveActionState, setSensitiveActionState] = useState<
    'idle' | 'submitting' | 'accepted' | 'unknown_outcome'
  >('idle');
  const [sensitiveActionMessage, setSensitiveActionMessage] = useState('');
  const [sensitiveNeedsReauth, setSensitiveNeedsReauth] = useState(false);
  const [unknownOutcomeChecked, setUnknownOutcomeChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAccountData() {
      setIsLoadingAccountData(true);
      setAccountDataError('');
      try {
        const [profileData, preferencesData] = await Promise.all([
          accountApi<Profile>('/api/v1/profile'),
          accountApi<Preferences>('/api/v1/preferences'),
        ]);
        if (cancelled) return;
        setName(profileData.display_name ?? '');
        setBio(profileData.bio ?? '');
        setProfileVersion(profileData.row_version);
        setPreferences(preferencesData);
        setPreferenceText(
          JSON.stringify(preferencesData.preferences ?? {}, null, 2),
        );
      } catch (error) {
        if (!cancelled) setAccountDataError(accountErrorMessage(error));
      } finally {
        if (!cancelled) setIsLoadingAccountData(false);
      }
    }

    void loadAccountData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let cancelled = false;

    async function loadUser() {
      const { data, error } = await client!.auth.getUser();
      if (cancelled) return;

      if (error || !data.user) {
        setMessage('当前没有检测到 Supabase 登录会话，请先登录。');
        return;
      }

      const metadata = data.user.user_metadata ?? {};
      setName(
        typeof metadata.display_name === 'string'
          ? metadata.display_name
          : typeof metadata.name === 'string'
            ? metadata.name
            : '',
      );
      setEmail(data.user.email ?? '');
      setPhone(data.user.phone ?? '');
      setCurrentEmail(data.user.email ?? '');
      setCurrentPhone(data.user.phone ?? '');
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!verificationExpiresAt) {
      setVerificationRemaining(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((verificationExpiresAt - Date.now()) / 1000),
      );
      setVerificationRemaining(remaining);

      if (remaining === 0) setVerificationExpiresAt(null);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);

    return () => window.clearInterval(timer);
  }, [verificationExpiresAt]);

  function resetVerification() {
    setVerificationTarget(null);
    setVerificationCode('');
    setVerificationExpiresAt(null);
    setVerificationRemaining(0);
    setPendingEmail('');
    setPendingPhone('');
    setVerificationMessage('');
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (profileVersion === null) {
      setMessage(accountDataError || '账户资料尚未加载完成，请稍后重试。');
      return;
    }

    setIsSavingProfile(true);
    try {
      const profile = await accountApi<Profile>('/api/v1/profile', {
        method: 'PATCH',
        headers: { 'If-Match': `W/"${profileVersion}"` },
        body: JSON.stringify({ display_name: name.trim(), bio }),
      });
      setProfileVersion(profile.row_version);
      setName(profile.display_name ?? '');
      setBio(profile.bio ?? '');

      if (supabase) {
        const { error } = await supabase.auth.updateUser({
          data: { display_name: profile.display_name ?? '' },
        });
        if (error) {
          setMessage(
            `资料已保存，但登录资料同步失败：${authErrorMessage(error)}`,
          );
          return;
        }
      }
      setMessage('资料已保存，服务端版本已更新。');
    } catch (error) {
      setMessage(accountErrorMessage(error));
    }
    setIsSavingProfile(false);
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preferences) {
      setPreferencesMessage(
        accountDataError || '偏好尚未加载完成，请稍后重试。',
      );
      return;
    }

    let patch: unknown;
    try {
      patch = JSON.parse(preferenceText);
    } catch {
      setPreferencesMessage('偏好必须是有效的 JSON 对象。');
      return;
    }
    if (!patch || Array.isArray(patch) || typeof patch !== 'object') {
      setPreferencesMessage('偏好必须是 JSON 对象。');
      return;
    }

    setIsSavingPreferences(true);
    setPreferencesMessage('正在保存偏好…');
    try {
      const nextPreferences = await accountApi<Preferences>(
        '/api/v1/preferences',
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/merge-patch+json',
            'If-Match': `W/"${preferences.row_version}"`,
          },
          body: JSON.stringify(patch),
        },
      );
      setPreferences(nextPreferences);
      setPreferenceText(
        JSON.stringify(nextPreferences.preferences ?? {}, null, 2),
      );
      setPreferencesMessage('偏好已保存，服务端版本已更新。');
    } catch (error) {
      setPreferencesMessage(accountErrorMessage(error));
    } finally {
      setIsSavingPreferences(false);
    }
  }

  async function requestReauth() {
    setIsSendingReauth(true);
    setReauthMessage('正在发送验证邮件…');
    try {
      await accountApi<{ requested: true }>('/api/auth/reauth/start', {
        method: 'POST',
      });
      setReauthMessage('验证邮件已发送，请粘贴邮件链接中的 token_hash。');
    } catch (error) {
      setReauthMessage(accountErrorMessage(error));
    } finally {
      setIsSendingReauth(false);
    }
  }

  async function verifyReauth() {
    const value = tokenHash.trim();
    if (!value) {
      setReauthMessage('请先粘贴邮件链接中的 token_hash。');
      return;
    }

    setIsVerifyingReauth(true);
    setReauthMessage('正在验证近期认证…');
    try {
      await accountApi<{ verified: true }>('/api/auth/reauth/verify', {
        method: 'POST',
        body: JSON.stringify({ token_hash: value }),
      });
      setTokenHash('');
      setReauthMessage('近期认证已完成，可执行敏感账户操作。');
      setSensitiveNeedsReauth(false);
    } catch (error) {
      setReauthMessage(accountErrorMessage(error));
    } finally {
      setIsVerifyingReauth(false);
    }
  }

  async function submitSensitiveAction() {
    if (!pendingSensitiveAction || sensitiveActionState === 'submitting')
      return;

    setSensitiveActionState('submitting');
    setSensitiveActionMessage('正在提交，请勿重复点击。');
    setSensitiveNeedsReauth(false);
    try {
      await accountApi(pendingSensitiveAction.path, { method: 'POST' });
      setSensitiveActionState('accepted');
      setSensitiveActionMessage(
        pendingSensitiveAction.path.endsWith('delete-request')
          ? '全局删除请求已受理，后续由后台流程处理。'
          : '当前平台账户已关闭。',
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'RECENT_MFA_REQUIRED') {
        setSensitiveActionState('idle');
        setSensitiveNeedsReauth(true);
        setSensitiveActionMessage('请先完成近期认证，再提交这项敏感操作。');
      } else if (code === 'AUTHORIZATION_UNAVAILABLE') {
        setSensitiveActionState('unknown_outcome');
        setUnknownOutcomeChecked(false);
        setSensitiveActionMessage('结果待确认：网络在服务端响应前中断。');
      } else {
        setSensitiveActionState('idle');
        setSensitiveActionMessage(accountErrorMessage(error));
      }
    }
  }

  function openSensitiveAction(action: SensitiveAction) {
    setPendingSensitiveAction(action);
    setSensitiveActionState('idle');
    setSensitiveActionMessage('');
    setSensitiveNeedsReauth(false);
    setUnknownOutcomeChecked(false);
  }

  function closeSensitiveAction() {
    setPendingSensitiveAction(null);
    setSensitiveActionState('idle');
    setSensitiveActionMessage('');
    setSensitiveNeedsReauth(false);
    setUnknownOutcomeChecked(false);
  }

  async function sendVerificationCode(target: VerificationTarget) {
    setVerificationMessage('');

    if (!supabase) {
      setVerificationMessage('请先配置 Supabase 公共环境变量。');
      return;
    }

    const targetEmail = email.trim().toLowerCase();
    const targetPhone = normalizePhone(phone);

    if (target === 'email') {
      if (!/^\S+@\S+\.\S+$/u.test(targetEmail)) {
        setVerificationMessage('请输入有效的邮箱地址。');
        return;
      }
      if (targetEmail === currentEmail.trim().toLowerCase()) {
        setVerificationMessage('请输入新的邮箱地址后再获取验证码。');
        return;
      }
    }

    if (target === 'phone' && !targetPhone) {
      setVerificationMessage('请输入有效手机号，例如 13800138000。');
      return;
    }
    const verifiedPhone = targetPhone ?? '';
    if (
      target === 'phone' &&
      currentPhone &&
      verifiedPhone === normalizePhone(currentPhone)
    ) {
      setVerificationMessage('请输入新的手机号后再获取验证码。');
      return;
    }

    setIsSendingVerification(true);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      setVerificationMessage('当前没有检测到 Supabase 登录会话，请先登录。');
      setIsSendingVerification(false);
      return;
    }

    if (target === 'email') {
      const { error: updateError } = await supabase.auth.updateUser({
        email: targetEmail,
      });

      if (updateError) {
        setVerificationMessage(authErrorMessage(updateError));
        setIsSendingVerification(false);
        return;
      }

      setPendingEmail(targetEmail);
      setVerificationTarget('email');
      setVerificationMessage(`验证码已发送至 ${maskEmail(targetEmail)}。`);
    } else {
      const { error: updateError } = await supabase.auth.updateUser({
        phone: verifiedPhone,
      });

      if (updateError) {
        setVerificationMessage(authErrorMessage(updateError));
        setIsSendingVerification(false);
        return;
      }

      setPendingPhone(verifiedPhone);
      setVerificationTarget('phone');
      setVerificationMessage(`验证码已发送至 ${maskPhone(verifiedPhone)}。`);
    }

    setVerificationCode('');
    setVerificationExpiresAt(Date.now() + OTP_COUNTDOWN_SECONDS * 1000);
    setIsSendingVerification(false);
  }

  async function verifyVerificationCode() {
    if (!supabase || !verificationTarget) return;

    const code = verificationCode.trim();
    if (!/^\d{6}$/u.test(code)) {
      setVerificationMessage('请输入 6 位数字验证码。');
      return;
    }
    if (verificationRemaining === 0) {
      setVerificationMessage('验证码已过期，请重新获取。');
      return;
    }

    setIsVerifying(true);
    const result =
      verificationTarget === 'email'
        ? await supabase.auth.verifyOtp({
            email: pendingEmail,
            token: code,
            type: 'email_change',
          })
        : await supabase.auth.verifyOtp({
            phone: pendingPhone,
            token: code,
            type: 'phone_change',
          });

    if (result.error) {
      setVerificationMessage(authErrorMessage(result.error));
      setIsVerifying(false);
      return;
    }

    const successMessage =
      verificationTarget === 'email' ? '邮箱绑定成功。' : '手机号绑定成功。';
    if (verificationTarget === 'email') {
      setEmail(pendingEmail);
      setCurrentEmail(pendingEmail);
    }
    if (verificationTarget === 'phone') {
      setPhone(pendingPhone);
      setCurrentPhone(pendingPhone);
    }
    setMessage(successMessage);
    setVerificationMessage('');
    setVerificationCode('');
    setVerificationTarget(null);
    setVerificationExpiresAt(null);
    setVerificationRemaining(0);
    setPendingEmail('');
    setPendingPhone('');
    setIsVerifying(false);
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage('');

    if (!oldPassword.trim()) {
      setPasswordMessage('请先输入旧密码');
      return;
    }
    if (password.length < 8) {
      setPasswordMessage('密码至少需要 8 个字符');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMessage('两次输入的密码不一致');
      return;
    }
    if (!supabase) {
      setPasswordMessage('请先配置 Supabase 公共环境变量。');
      return;
    }

    setIsUpdatingPassword(true);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user?.email) {
      setPasswordMessage('当前账号没有可用于验证的邮箱登录方式。');
      setIsUpdatingPassword(false);
      return;
    }

    const { error: passwordError } = await supabase.auth.signInWithPassword({
      email: data.user.email,
      password: oldPassword,
    });

    if (passwordError) {
      setPasswordMessage('旧密码校验失败，请检查后重试。');
      setIsUpdatingPassword(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setPasswordMessage(
      updateError ? authErrorMessage(updateError) : '密码已更新。',
    );
    if (!updateError) {
      setOldPassword('');
      setPassword('');
      setConfirmPassword('');
    }
    setIsUpdatingPassword(false);
  }

  const verificationLabel =
    verificationTarget === 'email' ? '邮箱验证码' : '短信验证码';
  const verificationDestination =
    verificationTarget === 'email'
      ? maskEmail(pendingEmail)
      : maskPhone(pendingPhone);

  return (
    <ConsumerShell
      title="账户设置"
      description="账户资料、偏好与安全动作通过同源边界交给中央账户服务处理。"
    >
      <div className="consumer-settings-layout">
        <aside className="consumer-settings-nav" aria-label="账户设置导航">
          <p className="consumer-overline">账户设置</p>
          <a className="is-current" href="#profile">
            个人信息
          </a>
          <a href="#security">登录安全</a>
          <a href="#preferences">偏好设置</a>
        </aside>

        <div className="consumer-settings-content">
          <section
            className="consumer-panel"
            id="profile"
            aria-labelledby="profile-title"
          >
            <div className="consumer-panel-heading">
              <div>
                <p className="consumer-overline">个人资料</p>
                <h2 id="profile-title">账户信息</h2>
              </div>
              <span className="consumer-avatar consumer-avatar-large">林</span>
            </div>
            <form className="consumer-form-grid" onSubmit={saveProfile}>
              <label className="consumer-field consumer-field-full">
                <span>显示名称</span>
                <input
                  aria-label="显示名称"
                  disabled={isLoadingAccountData || isSavingProfile}
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="输入用户名"
                />
                <small>这个名称会显示在工作区和配置操作记录中。</small>
              </label>
              <label className="consumer-field consumer-field-full">
                <span>简介</span>
                <textarea
                  aria-label="简介"
                  disabled={isLoadingAccountData || isSavingProfile}
                  maxLength={500}
                  rows={3}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="简单介绍一下自己"
                />
                <small>资料由 Account API 保存，版本冲突时不会静默覆盖。</small>
              </label>
              {currentEmail ? (
                <div className="consumer-field">
                  <span>账户邮箱</span>
                  <div className="consumer-field-inline">
                    <input
                      id="email"
                      aria-label="账户邮箱"
                      value={currentEmail}
                      type="email"
                      readOnly
                    />
                    <span className="consumer-status">已绑定</span>
                  </div>
                  <small>邮箱用于登录和安全通知。</small>
                </div>
              ) : (
                <div className="consumer-field">
                  <span>绑定邮箱</span>
                  <div className="consumer-field-inline">
                    <input
                      id="email"
                      aria-label="绑定邮箱"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (verificationTarget === 'email') resetVerification();
                      }}
                      type="email"
                      inputMode="email"
                      placeholder="输入邮箱"
                    />
                    <button
                      className="consumer-button consumer-button-secondary consumer-button-compact"
                      type="button"
                      disabled={
                        isSendingVerification || verificationRemaining > 0
                      }
                      onClick={() => void sendVerificationCode('email')}
                    >
                      {verificationRemaining > 0 &&
                      verificationTarget === 'email'
                        ? `${verificationRemaining}s 后重发`
                        : '获取验证码'}
                    </button>
                  </div>
                  <small>当前未绑定邮箱，可通过验证码关联。</small>
                </div>
              )}
              {currentPhone ? (
                <div className="consumer-field">
                  <span>手机号</span>
                  <div className="consumer-field-inline">
                    <input
                      id="phone"
                      aria-label="手机号"
                      value={currentPhone}
                      type="tel"
                      readOnly
                    />
                    <span className="consumer-status">已绑定</span>
                  </div>
                  <small>手机号可用于登录和接收安全通知。</small>
                </div>
              ) : (
                <div className="consumer-field">
                  <span>绑定手机号</span>
                  <div className="consumer-field-inline">
                    <input
                      id="phone"
                      aria-label="绑定手机号"
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        if (verificationTarget === 'phone') resetVerification();
                      }}
                      type="tel"
                      inputMode="tel"
                      placeholder="输入手机号"
                    />
                    <button
                      className="consumer-button consumer-button-secondary consumer-button-compact"
                      type="button"
                      disabled={
                        isSendingVerification || verificationRemaining > 0
                      }
                      onClick={() => void sendVerificationCode('phone')}
                    >
                      {verificationRemaining > 0 &&
                      verificationTarget === 'phone'
                        ? `${verificationRemaining}s 后重发`
                        : '获取验证码'}
                    </button>
                  </div>
                  <small>当前未绑定手机号，可通过验证码关联。</small>
                </div>
              )}
              {verificationTarget ? (
                <div className="consumer-verification-panel consumer-field-full">
                  <div className="consumer-verification-heading">
                    <div>
                      <span>{verificationLabel}</span>
                      <small>验证码已发送至 {verificationDestination}</small>
                    </div>
                    <strong>
                      {verificationRemaining > 0
                        ? `${verificationRemaining}s`
                        : '已过期'}
                    </strong>
                  </div>
                  <div className="consumer-field-inline">
                    <input
                      id="verification-code"
                      aria-label={verificationLabel}
                      value={verificationCode}
                      onChange={(event) =>
                        setVerificationCode(
                          event.target.value.replace(/\D/gu, '').slice(0, 6),
                        )
                      }
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="输入 6 位验证码"
                    />
                    <button
                      className="consumer-button consumer-button-primary consumer-button-compact"
                      type="button"
                      disabled={isVerifying || verificationRemaining === 0}
                      onClick={() => void verifyVerificationCode()}
                    >
                      {isVerifying
                        ? '验证中…'
                        : verificationTarget === 'email'
                          ? '绑定邮箱'
                          : '绑定手机号'}
                    </button>
                  </div>
                  <small role="status">
                    {verificationMessage ||
                      '验证码有效期 60 秒，过期后可重新获取。'}
                  </small>
                </div>
              ) : null}
              <div className="consumer-form-footer consumer-field-full">
                <span className="consumer-form-message" role="status">
                  {accountDataError ||
                    (!verificationTarget && verificationMessage) ||
                    message}
                </span>
                <button
                  className="consumer-button consumer-button-primary"
                  type="submit"
                  disabled={isSavingProfile || isLoadingAccountData}
                >
                  {isSavingProfile ? '保存中…' : '保存资料'}
                </button>
              </div>
            </form>
          </section>

          <section
            className="consumer-panel"
            id="security"
            aria-labelledby="security-title"
          >
            <div className="consumer-panel-heading">
              <div>
                <p className="consumer-overline">账户安全</p>
                <h2 id="security-title">修改密码</h2>
              </div>
            </div>
            <form className="consumer-password-form" onSubmit={updatePassword}>
              <label className="consumer-field consumer-field-full">
                <span>旧密码</span>
                <input
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  type="password"
                  placeholder="输入当前密码"
                />
                <small>修改密码前会先用 Supabase Auth 验证旧密码。</small>
              </label>
              <label className="consumer-field">
                <span>新密码</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  minLength={8}
                  required
                  placeholder="至少 8 个字符"
                />
              </label>
              <label className="consumer-field">
                <span>确认新密码</span>
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  minLength={8}
                  required
                  placeholder="再次输入新密码"
                />
              </label>
              <div className="consumer-form-footer">
                <span className="consumer-form-message" role="status">
                  {passwordMessage}
                </span>
                <button
                  className="consumer-button consumer-button-secondary"
                  type="submit"
                  disabled={isUpdatingPassword}
                >
                  {isUpdatingPassword ? '验证中…' : '更新密码'}
                </button>
              </div>
            </form>
          </section>

          <section
            className="consumer-panel"
            id="preferences"
            aria-labelledby="preferences-title"
          >
            <div className="consumer-panel-heading">
              <div>
                <p className="consumer-overline">工作区偏好</p>
                <h2 id="preferences-title">偏好设置</h2>
              </div>
              <span className="consumer-status">Account API</span>
            </div>
            <form className="consumer-form-grid" onSubmit={savePreferences}>
              <label className="consumer-field consumer-field-full">
                <span>JSON Merge Patch</span>
                <textarea
                  aria-label="JSON Merge Patch"
                  disabled={isLoadingAccountData || isSavingPreferences}
                  value={preferenceText}
                  onChange={(event) => setPreferenceText(event.target.value)}
                  rows={7}
                  spellCheck={false}
                />
                <small>
                  偏好只影响工作区体验，不参与订阅或授权判断；null
                  会删除对应键。
                </small>
              </label>
              <div className="consumer-form-footer consumer-field-full">
                <span className="consumer-form-message" role="status">
                  {preferencesMessage}
                </span>
                <button
                  className="consumer-button consumer-button-primary"
                  type="submit"
                  disabled={isLoadingAccountData || isSavingPreferences}
                >
                  {isSavingPreferences ? '保存中…' : '保存偏好'}
                </button>
              </div>
            </form>
          </section>

          <section
            className="consumer-note-panel"
            aria-labelledby="reauth-title"
          >
            <div>
              <strong id="reauth-title">近期认证与账户动作</strong>
              <p>
                {supabase
                  ? '敏感操作需要通过 Supabase Auth 邮件完成近期认证；临时会话不会返回浏览器。'
                  : '当前尚未配置 Supabase Auth，近期认证暂不可用。'}
              </p>
              <div className="consumer-field-inline">
                <button
                  className="consumer-button consumer-button-secondary consumer-button-compact"
                  type="button"
                  disabled={isSendingReauth}
                  onClick={() => void requestReauth()}
                >
                  {isSendingReauth ? '发送中…' : '发送验证邮件'}
                </button>
                <input
                  aria-label="近期认证 token_hash"
                  placeholder="粘贴 token_hash"
                  value={tokenHash}
                  onChange={(event) => setTokenHash(event.target.value)}
                  autoComplete="off"
                />
                <button
                  className="consumer-button consumer-button-primary consumer-button-compact"
                  type="button"
                  disabled={isVerifyingReauth || !tokenHash.trim()}
                  onClick={() => void verifyReauth()}
                >
                  {isVerifyingReauth ? '验证中…' : '验证并回到确认'}
                </button>
              </div>
              <small role="status">{reauthMessage}</small>
            </div>
            <div className="consumer-form-footer">
              <button
                className="consumer-button consumer-button-secondary consumer-button-compact"
                type="button"
                onClick={() =>
                  openSensitiveAction({
                    label: '全局删除请求',
                    path: '/api/v1/identity/delete-request',
                  })
                }
              >
                提交全局删除请求
              </button>
              <button
                className="consumer-button consumer-button-secondary consumer-button-compact"
                type="button"
                onClick={() =>
                  openSensitiveAction({
                    label: '关闭当前账户',
                    path: '/api/v1/account/close',
                  })
                }
              >
                关闭当前账户
              </button>
            </div>
          </section>

          {pendingSensitiveAction ? (
            <div
              className="consumer-modal-backdrop"
              data-test="confirm-action-dialog"
            >
              <div className="consumer-modal" role="dialog" aria-modal="true">
                <p className="consumer-overline">确认账户动作</p>
                <h2>确认{pendingSensitiveAction.label}？</h2>
                <p>
                  这项操作会由中央账户服务记录并执行，请确认目标和当前会话。
                </p>
                {sensitiveNeedsReauth ? (
                  <div role="alert">
                    <p>请先完成近期认证，再重新提交。</p>
                    <button
                      className="consumer-button consumer-button-secondary consumer-button-compact"
                      type="button"
                      disabled={isSendingReauth}
                      onClick={() => void requestReauth()}
                    >
                      {isSendingReauth ? '发送中…' : '发送验证邮件'}
                    </button>
                    <label className="consumer-field">
                      <span>邮件 token_hash</span>
                      <input
                        aria-label="近期认证 token_hash"
                        placeholder="粘贴 token_hash"
                        value={tokenHash}
                        onChange={(event) => setTokenHash(event.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <button
                      className="consumer-button consumer-button-primary consumer-button-compact"
                      type="button"
                      disabled={isVerifyingReauth || !tokenHash.trim()}
                      onClick={() => void verifyReauth()}
                    >
                      {isVerifyingReauth ? '验证中…' : '验证并回到确认'}
                    </button>
                    {reauthMessage ? <small>{reauthMessage}</small> : null}
                  </div>
                ) : null}
                {sensitiveActionState === 'unknown_outcome' ? (
                  <div role="status">
                    <strong>
                      {unknownOutcomeChecked ? '结果仍待确认' : '结果待确认'}
                    </strong>
                    <p>{sensitiveActionMessage}</p>
                    {!unknownOutcomeChecked ? (
                      <button
                        className="consumer-button consumer-button-secondary consumer-button-compact"
                        type="button"
                        data-test="confirm-action-check-unknown"
                        onClick={() => {
                          setUnknownOutcomeChecked(true);
                          setSensitiveActionMessage(
                            '请刷新账户状态或联系支持确认服务端最终结果。',
                          );
                        }}
                      >
                        我已检查权威状态
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {sensitiveActionState === 'accepted' ? (
                  <p role="status">已受理</p>
                ) : null}
                <div className="consumer-form-footer">
                  <button
                    className="consumer-button consumer-button-secondary"
                    type="button"
                    data-test="confirm-action-cancel"
                    onClick={closeSensitiveAction}
                  >
                    取消
                  </button>
                  <button
                    className="consumer-button consumer-button-primary"
                    type="button"
                    data-test="confirm-action-submit"
                    disabled={
                      sensitiveActionState === 'submitting' ||
                      sensitiveActionState === 'accepted' ||
                      sensitiveActionState === 'unknown_outcome'
                    }
                    onClick={() => void submitSensitiveAction()}
                  >
                    {sensitiveActionState === 'accepted'
                      ? '已受理'
                      : sensitiveActionState === 'submitting'
                        ? '提交中…'
                        : '确认提交'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ConsumerShell>
  );
}
