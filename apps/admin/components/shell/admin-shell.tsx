'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SessionExpiredError } from '@kit/account-auth-nextjs/browser';

import { Button } from '@kit/ui/button';
import { SidebarProvider } from '@kit/ui/sidebar';
import { SupportErrorId } from '@kit/ui/support-error-id';

import { adminAuthSession } from '../../app/_lib/auth-session';
import {
  resolveAdminSecurityView,
  type AdminSecurityStatusPayload,
  type AdminSecurityView,
} from '../../features/security/admin-security-status';

import { AdminSidebar } from './admin-sidebar';
import { AdminShellContextProvider } from './admin-shell-context';
import { AdminTopbar } from './admin-topbar';

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginFlow = pathname === '/admin/login';
  const [retry, setRetry] = useState(0);
  const [securityView, setSecurityView] = useState<
    AdminSecurityView | { kind: 'loading' }
  >({ kind: 'loading' });
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [switchAccountError, setSwitchAccountError] = useState(false);

  useEffect(() => {
    if (isLoginFlow) return;
    let active = true;
    setSecurityView({ kind: 'loading' });
    void (async () => {
      try {
        const response = await adminAuthSession.request(
          '/api/v1/admin/api/v1/security/status',
          { cache: 'no-store' },
        );
        const payload = (await response
          .json()
          .catch(() => null)) as AdminSecurityStatusPayload | null;
        if (!active) return;
        const view = resolveAdminSecurityView(response, payload);
        if (view.kind === 'unauthenticated') {
          router.replace('/admin/login');
          return;
        }
        if (view.kind === 'aal1' && pathname !== '/admin/mfa') {
          router.replace('/admin/mfa');
          return;
        }
        if (view.kind === 'aal2' && pathname === '/admin/mfa') {
          router.replace('/admin');
          return;
        }
        setSecurityView(view);
      } catch (error) {
        if (!active) return;
        if (
          error instanceof SessionExpiredError ||
          (error instanceof Error && error.name === 'SessionExpiredError') ||
          adminAuthSession.getSessionState().state === 'expired'
        ) {
          router.replace('/admin/login');
          return;
        }
        setSecurityView({
          kind: 'unavailable',
          requestId: null,
          errorCode: 'AUTHORIZATION_UNAVAILABLE',
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [isLoginFlow, pathname, retry, router]);

  async function switchAccount() {
    if (switchingAccount) return;
    setSwitchingAccount(true);
    setSwitchAccountError(false);
    try {
      const response = await adminAuthSession.logout();
      if (!response.ok) {
        setSwitchAccountError(true);
        return;
      }
      router.replace('/admin/login');
    } catch {
      setSwitchAccountError(true);
    } finally {
      setSwitchingAccount(false);
    }
  }

  if (
    isLoginFlow ||
    (securityView.kind === 'aal1' && pathname === '/admin/mfa')
  ) {
    return <div className="admin-auth-page">{children}</div>;
  }

  if (securityView.kind === 'admin_required') {
    return (
      <div className="admin-auth-layout" data-test="admin-security-not-admin">
        <main className="panel stack-form admin-auth-card">
          <h1>没有管理员访问权限</h1>
          <p className="muted">
            当前账号不是系统管理员。请退出后切换到管理员账号。
          </p>
          <Button
            type="button"
            onClick={() => void switchAccount()}
            disabled={switchingAccount}
            data-test="admin-security-switch-account"
          >
            {switchingAccount ? '正在退出…' : '退出并切换账号'}
          </Button>
          {switchAccountError ? (
            <p role="alert" className="text-sm text-destructive">
              退出失败，请重试。
            </p>
          ) : null}
          <SupportErrorId
            requestId={securityView.requestId}
            technicalDetail="ADMIN_REQUIRED"
          />
        </main>
      </div>
    );
  }

  if (securityView.kind === 'unavailable') {
    return (
      <div
        className="admin-auth-layout"
        data-test="admin-security-unavailable"
        role="alert"
      >
        <main className="panel stack-form admin-auth-card">
          <h1>无法确认管理员安全状态</h1>
          <p className="muted">授权服务暂时不可用，请重试后再进入管理页面。</p>
          <SupportErrorId
            requestId={securityView.requestId}
            technicalDetail={securityView.errorCode}
          />
          <Button
            type="button"
            onClick={() => setRetry((current) => current + 1)}
            data-test="admin-security-retry"
          >
            重试
          </Button>
        </main>
      </div>
    );
  }

  if (securityView.kind !== 'aal2' || pathname === '/admin/mfa') {
    return (
      <div
        className="admin-auth-layout"
        aria-busy="true"
        data-test="admin-security-loading"
      >
        <main className="panel stack-form admin-auth-card" role="status">
          <h1>正在检查管理员安全状态</h1>
          <p className="muted">确认完成前不会加载管理数据。</p>
        </main>
      </div>
    );
  }

  return (
    <AdminShellContextProvider>
      <SidebarProvider
        defaultOpen
        data-test="admin-shell"
        className="admin-shell-root min-h-svh"
      >
        <AdminSidebar />
        <div className="admin-shell-inset">
          <AdminTopbar />
          <div className="admin-shell-content">{children}</div>
        </div>
      </SidebarProvider>
    </AdminShellContextProvider>
  );
}
