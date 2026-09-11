'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { createBrowserSupabaseClient } from '@kit/account-auth-nextjs/browser';

import { ConsumerShell } from '../../components/consumer-shell';

type VerificationTarget = 'email' | 'phone';

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

export default function AccountPage() {
  const [name, setName] = useState('林默');
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

    if (!supabase) {
      setMessage('请先配置 Supabase 公共环境变量。');
      return;
    }

    setIsSavingProfile(true);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      setMessage('当前没有检测到 Supabase 登录会话，请先登录。');
      setIsSavingProfile(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { display_name: name.trim() },
    });

    setMessage(
      updateError ? authErrorMessage(updateError) : '账户信息已保存到 Supabase',
    );
    setIsSavingProfile(false);
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
      description="账户资料和绑定验证由 Supabase Auth 处理。"
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
                <span>用户名</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="输入用户名"
                />
                <small>这个名称会显示在工作区和配置操作记录中。</small>
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
                  {!verificationTarget && verificationMessage
                    ? verificationMessage
                    : message}
                </span>
                <button
                  className="consumer-button consumer-button-primary"
                  type="submit"
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? '保存中…' : '保存信息'}
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

          <section className="consumer-note-panel" id="preferences">
            <div>
              <strong>账户验证状态</strong>
              <p>
                {supabase
                  ? '当前页面已接入 Supabase Auth。邮箱和手机号验证码由 Supabase 发送并校验。'
                  : '当前页面尚未读取到 Supabase 公共环境变量，请配置 NEXT_PUBLIC_SUPABASE_URL 和公共密钥后启用验证。'}
              </p>
            </div>
            <span className="consumer-status">
              {supabase ? 'Supabase Auth' : '待配置'}
            </span>
          </section>
        </div>
      </div>
    </ConsumerShell>
  );
}
