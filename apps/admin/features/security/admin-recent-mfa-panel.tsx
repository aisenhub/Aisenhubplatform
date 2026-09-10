'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';

type Factor = {
  id: string;
  factor_type: string;
  friendly_name: string | null;
};

type AdminRecentMfaPanelProps = {
  onVerified: () => void;
};

export function AdminRecentMfaPanel({ onVerified }: AdminRecentMfaPanelProps) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<
    'loading' | 'ready' | 'empty' | 'error' | 'verified'
  >('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [pending, setPending] = useState(false);

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
        setState('error');
        setErrorMessage(
          response.status === 401
            ? '管理员会话已结束，请重新登录。'
            : response.status === 403
              ? '当前管理员账号没有读取认证器的权限。'
              : '认证器列表暂时不可用，请稍后重试。',
        );
        return;
      }
      const nextFactors = Array.isArray(payload?.data?.factors)
        ? payload.data.factors
        : [];
      setFactors(nextFactors);
      setFactorId(nextFactors[0]?.id ?? '');
      setState(nextFactors.length ? 'ready' : 'empty');
    } catch (caught) {
      setState('error');
      setErrorMessage(sessionErrorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/u.test(code)) {
      setErrorMessage('请输入认证器生成的 6 位验证码。');
      return;
    }
    setPending(true);
    setErrorMessage('');
    const epoch = adminAuthSession.getEpoch();
    try {
      const response = await adminAuthSession.request(
        '/api/auth/mfa/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ factor_id: factorId, code }),
        },
        { replay: 'never' },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: { code?: string; details?: Record<string, string> };
      } | null;
      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      if (!response.ok) {
        setState('ready');
        setErrorMessage(
          payload?.error?.details?.proof_issued === 'false'
            ? 'MFA 已验证，但近期认证证明没有签发；请稍后重试。'
            : 'MFA 验证失败，请检查验证码后重试。',
        );
        return;
      }
      adminAuthSession.completeAuthentication('admin_recent_mfa');
      setState('verified');
      onVerified();
    } catch (caught) {
      setErrorMessage(sessionErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  if (state === 'loading') {
    return (
      <div
        className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground"
        data-test="recent-mfa-loading"
      >
        正在读取已验证的 MFA 因子…
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <Alert data-test="recent-mfa-empty">
        <AlertTitle>还没有可用的已验证认证器</AlertTitle>
        <AlertDescription>
          请先在安全设置中绑定认证器；本次操作 intent
          会保留在当前页面，不会自动重放。
          <Button
            variant="link"
            size="sm"
            className="ml-1 px-0"
            render={<Link href="/admin/mfa" />}
            data-test="recent-mfa-manage"
          >
            打开 MFA 设置
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (state === 'verified') {
    return (
      <Alert data-test="recent-mfa-verified">
        <AlertTitle>近期 MFA 已验证</AlertTitle>
        <AlertDescription>
          请回到上方确认按钮，显式再次提交原操作。
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div
      className="grid gap-3 rounded-lg border border-border/70 bg-muted/30 p-3"
      data-test="recent-mfa-panel"
    >
      <div>
        <div className="text-sm font-medium text-foreground">
          在当前页面完成近期 MFA
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          proof 由服务端签发并绑定当前 Admin session；页面不会计算或保存有效期。
        </p>
      </div>
      <form className="grid gap-3" onSubmit={verify}>
        {factors.length > 1 ? (
          <div className="grid gap-2">
            <Label htmlFor="recent-mfa-factor">认证器</Label>
            <select
              id="recent-mfa-factor"
              value={factorId}
              onChange={(event) => setFactorId(event.target.value)}
              disabled={pending}
              data-test="recent-mfa-factor"
            >
              {factors.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.friendly_name || factor.factor_type || '已验证认证器'}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="recent-mfa-code">6 位验证码</Label>
          <Input
            id="recent-mfa-code"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            disabled={pending}
            data-test="recent-mfa-code"
          />
        </div>
        {errorMessage ? (
          <p
            className="text-sm text-destructive"
            role="alert"
            data-test="recent-mfa-error"
          >
            {errorMessage}
          </p>
        ) : null}
        <Button
          type="submit"
          size="sm"
          className="w-fit"
          disabled={pending}
          data-test="recent-mfa-submit"
        >
          {pending ? '验证中…' : '验证近期 MFA'}
        </Button>
      </form>
      {state === 'error' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => void loadFactors()}
          data-test="recent-mfa-retry"
        >
          重试读取认证器
        </Button>
      ) : null}
    </div>
  );
}
