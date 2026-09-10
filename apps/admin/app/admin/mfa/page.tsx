'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  adminAuthSession,
  sessionErrorMessage,
  useAdminSessionSnapshot,
} from '../../_lib/auth-session';

type Factor = {
  id: string;
  factor_type: string;
  friendly_name: string | null;
};

type Enrollment = Factor & {
  qr_code: string;
  secret: string;
  uri: string;
};

export default function AdminMfaPage() {
  const sessionSnapshot = useAdminSessionSnapshot();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [status, setStatus] = useState('正在读取已验证的 MFA 因子…');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (
      !sessionSnapshot.resolved ||
      !['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    )
      return;
    setFactors([]);
    setFactorId('');
    setCode('');
    setEnrollment(null);
    setStatus('会话已结束，MFA 状态与密钥已清理。');
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  async function loadFactors() {
    const epoch = adminAuthSession.getEpoch();
    let response: Response;
    try {
      response = await adminAuthSession.request('/api/auth/mfa/factors');
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      data?: { factors?: Factor[] };
      error?: { code?: string };
    } | null;
    if (!adminAuthSession.isCurrentEpoch(epoch)) return;
    if (!response.ok) {
      setFactors([]);
      setFactorId('');
      setStatus(
        `MFA 因子读取失败：${payload?.error?.code ?? 'AUTHORIZATION_UNAVAILABLE'}`,
      );
      return;
    }
    const nextFactors = payload?.data?.factors ?? [];
    setFactors(nextFactors);
    setFactorId(nextFactors[0]?.id ?? '');
    setStatus(
      nextFactors.length
        ? '请输入认证器中的 6 位验证码。'
        : '没有可用的已验证 MFA 因子，请先绑定认证器。',
    );
  }

  useEffect(() => {
    void loadFactors().catch(() =>
      setStatus('MFA 服务暂时不可用，请稍后重试。'),
    );
  }, []);

  async function startEnrollment() {
    const epoch = adminAuthSession.getEpoch();
    setEnrolling(true);
    setStatus('正在生成认证器绑定信息…');
    try {
      const response = await adminAuthSession.request(
        '/api/auth/mfa/enroll',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        { replay: 'never' },
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: { factor?: Enrollment; code?: string };
        error?: { code?: string };
      } | null;
      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      if (!response.ok || !payload?.data?.factor) {
        setStatus(
          `绑定准备失败：${payload?.error?.code ?? 'AUTHORIZATION_UNAVAILABLE'}`,
        );
        return;
      }
      setEnrollment(payload.data.factor);
      setStatus('请扫码或手动输入密钥，然后输入认证器生成的 6 位验证码。');
    } catch (error) {
      setStatus(sessionErrorMessage(error));
    } finally {
      setEnrolling(false);
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    const epoch = adminAuthSession.getEpoch();
    setStatus('正在验证新认证器…');
    let response: Response;
    try {
      response = await adminAuthSession.request(
        '/api/auth/mfa/enroll/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ factor_id: enrollment.id, code }),
        },
        { replay: 'never' },
      );
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; details?: Record<string, string> };
    } | null;
    if (!adminAuthSession.isCurrentEpoch(epoch)) return;
    if (!response.ok) {
      const details = payload?.error?.details;
      setStatus(
        details?.enrollment_verified === 'true'
          ? '认证器已绑定，但近期认证证明签发失败；请使用已有认证器重试。'
          : `认证器绑定失败：${payload?.error?.code ?? 'AUTHORIZATION_UNAVAILABLE'}`,
      );
      return;
    }
    setEnrollment(null);
    setCode('');
    await loadFactors();
    adminAuthSession.completeAuthentication('admin_mfa');
    setStatus('认证器已绑定并完成 MFA，正在进入 Admin…');
    window.location.assign('/admin');
  }

  async function verifyExistingFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const epoch = adminAuthSession.getEpoch();
    setStatus('正在验证 MFA 并获取近期认证证明…');
    let response: Response;
    try {
      response = await adminAuthSession.request(
        '/api/auth/mfa/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ factor_id: factorId, code }),
        },
        { replay: 'never' },
      );
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      return;
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { code?: string; details?: Record<string, string> };
      } | null;
      const details = payload?.error?.details;
      setStatus(
        details?.mfa_verified === 'true'
          ? 'MFA 已验证，但近期认证证明签发失败；请稍后重试。'
          : `MFA 失败：${payload?.error?.code ?? 'AUTHORIZATION_UNAVAILABLE'}`,
      );
      return;
    }
    if (!adminAuthSession.isCurrentEpoch(epoch)) return;
    adminAuthSession.completeAuthentication('admin_recent_mfa');
    window.location.assign('/admin');
  }

  async function copySecret() {
    if (!enrollment) return;
    await navigator.clipboard.writeText(enrollment.secret);
    setStatus('密钥已复制到剪贴板；请勿分享该密钥。');
  }

  return (
    <main className="shell" data-test="admin-mfa-page">
      <h1>验证管理员身份</h1>
      <p className="muted">
        Admin 操作需要 AAL2；验证成功后，服务端向当前 session 绑定 5 分钟
        proof，浏览器不会自行提交 proof。
      </p>

      {!factors.length && !enrollment ? (
        <section className="panel">
          <h2>绑定认证器</h2>
          <p className="muted">
            使用 Google Authenticator、Microsoft Authenticator 或其他兼容 TOTP
            的认证器绑定此 Admin 账户。
          </p>
          <button
            type="button"
            data-test="mfa-enroll-start"
            onClick={startEnrollment}
            disabled={enrolling}
          >
            {enrolling ? '正在生成…' : '生成绑定二维码'}
          </button>
        </section>
      ) : null}

      {enrollment ? (
        <section className="panel">
          <h2>绑定 Aisenhub Admin 认证器</h2>
          <p className="muted">
            用认证器扫描二维码。无法扫码时，可复制下方密钥手动添加。
          </p>
          <div className="totp-qr">
            <img src={enrollment.qr_code} alt="TOTP 认证器绑定二维码" />
          </div>
          <div className="one-time-secret">
            <strong>手动密钥</strong>
            <code>{enrollment.secret}</code>
            <button
              type="button"
              data-test="mfa-secret-copy"
              onClick={() => void copySecret()}
            >
              复制密钥
            </button>
            <small>
              该密钥只在本次绑定流程显示，请勿分享，也不会写入 URL。
            </small>
          </div>
          <form className="stack-form" onSubmit={verifyEnrollment}>
            <label htmlFor="enrollment-code">认证器 6 位验证码</label>
            <input
              id="enrollment-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            <button
              type="submit"
              data-test="mfa-enroll-submit"
              disabled={code.length !== 6}
            >
              确认绑定
            </button>
          </form>
        </section>
      ) : null}

      {factors.length ? (
        <form className="panel stack-form" onSubmit={verifyExistingFactor}>
          <label htmlFor="factor">认证器</label>
          <select
            id="factor"
            value={factorId}
            onChange={(event) => setFactorId(event.target.value)}
            required
          >
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.friendly_name ?? factor.factor_type}
              </option>
            ))}
          </select>
          <label htmlFor="code">验证码</label>
          <input
            id="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
          <button
            type="submit"
            data-test="mfa-verify-submit"
            disabled={!factorId || code.length !== 6}
          >
            验证并继续
          </button>
        </form>
      ) : null}

      <span className="muted" role="status">
        {status}
      </span>
    </main>
  );
}
