'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const navigation = [
  { href: '/', label: '总览' },
  { href: '/account', label: '设置页' },
  { href: '/subscription', label: '套餐页' },
  { href: '/files', label: '资源页' },
  { href: '/pricing', label: '套餐' },
] as const;

export function ConsumerShell({
  title,
  description,
  actions,
  headerActions,
  children,
  narrow = false,
}: {
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
      <span>参考模板 · 无登录 · 无真实用户数据</span>
      <Link href="/pricing">查看套餐页</Link>
    </footer>
  );
}
