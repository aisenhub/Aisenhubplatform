'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Button } from '@kit/ui/button';

import {
  consumerAuthSession,
  sessionErrorMessage,
} from '../app/_lib/auth-session';

const navigation = [
  { href: '/', label: '总览' },
  { href: '/account', label: '账户' },
  { href: '/subscription', label: '订阅' },
  { href: '/files', label: '文件' },
  { href: '/pricing', label: '套餐' },
] as const;

export function ConsumerShell({
  eyebrow,
  title,
  description,
  actions,
  headerActions,
  children,
  narrow = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="consumer-app">
      <header className="consumer-header">
        <div className="consumer-header-inner">
          <Link className="consumer-brand" href="/" aria-label="Aisenhub 总览">
            <span className="consumer-brand-mark" aria-hidden="true">
              A
            </span>
            <span>Aisenhub</span>
          </Link>
          <nav className="consumer-nav" aria-label="主导航">
            {navigation.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`consumer-nav-link${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {headerActions ? (
            <div className="consumer-header-actions">{headerActions}</div>
          ) : null}
        </div>
      </header>
      <main className={`consumer-main${narrow ? ' consumer-main-narrow' : ''}`}>
        <div className="consumer-page-heading">
          <p className="consumer-eyebrow">{eyebrow}</p>
          <div className="consumer-heading-row">
            <div>
              <h1>{title}</h1>
              {description ? (
                <p className="consumer-description">{description}</p>
              ) : null}
            </div>
            {actions ? (
              <div className="consumer-heading-actions">{actions}</div>
            ) : null}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export function ConsumerFooter() {
  return (
    <footer className="consumer-footer">
      <span>同源 BFF · 服务端权限</span>
      <Link href="/login">登录</Link>
    </footer>
  );
}

export function ConsumerLogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function logout() {
    setPending(true);
    setError('');
    try {
      await consumerAuthSession.logout();
      window.location.assign('/login');
    } catch (caught) {
      setError(sessionErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="consumer-header-actions-group">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void logout()}
        disabled={pending}
        data-test="consumer-logout"
      >
        {pending ? '退出中…' : '退出登录'}
      </Button>
      {error ? (
        <span className="consumer-header-error" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
