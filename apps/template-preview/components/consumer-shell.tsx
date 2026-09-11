'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type IconName =
  | 'user'
  | 'file'
  | 'card'
  | 'bell'
  | 'more'
  | 'arrow'
  | 'infinity'
  | 'key';

const navigation = [
  {
    href: '/account',
    label: '账户设置',
    helper: '个人信息',
    icon: 'user' as const,
  },
  {
    href: '/files',
    label: '配置文件',
    helper: '上传与管理',
    icon: 'file' as const,
  },
  {
    href: '/subscription',
    label: '订阅方案',
    helper: '套餐与权益',
    icon: 'card' as const,
  },
];

function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'user') {
    return (
      <svg {...props}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.8-3.2 3.1-5 7-5s6.2 1.8 7 5" />
      </svg>
    );
  }

  if (name === 'file') {
    return (
      <svg {...props}>
        <path d="M6 3.8h8l4 4V20H6z" />
        <path d="M14 3.8v4h4M9 12h6M9 15.5h6" />
      </svg>
    );
  }

  if (name === 'card') {
    return (
      <svg {...props}>
        <rect x="3.5" y="5" width="17" height="14" rx="2" />
        <path d="M3.5 9h17M7 14h3" />
      </svg>
    );
  }

  if (name === 'bell') {
    return (
      <svg {...props}>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" />
        <path d="M10 21h4" />
      </svg>
    );
  }

  if (name === 'more') {
    return (
      <svg {...props}>
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'infinity') {
    return (
      <svg {...props}>
        <path d="M7.2 7.5c-2.1 0-3.7 1.8-3.7 4.5s1.6 4.5 3.7 4.5c1.8 0 3-1.3 4.8-4.5 1.8-3.2 3-4.5 4.8-4.5 2.1 0 3.7 1.8 3.7 4.5s-1.6 4.5-3.7 4.5c-1.8 0-3-1.3-4.8-4.5-1.8-3.2-3-4.5-4.8-4.5Z" />
      </svg>
    );
  }

  if (name === 'key') {
    return (
      <svg {...props}>
        <circle cx="8.5" cy="15.5" r="3.5" />
        <path d="m11 13 7.5-7.5M16 7l2 2M13.5 10l2 2" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

export function ConsumerShell({
  title,
  description,
  actions,
  children,
  narrow = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="consumer-app">
      <aside className="consumer-sidebar">
        <div className="consumer-sidebar-top">
          <Link
            className="consumer-brand"
            href="/files"
            aria-label="Aisenhub 配置平台"
          >
            <span className="consumer-brand-mark" aria-hidden="true">
              A
            </span>
            <span>Aisenhub</span>
          </Link>
          <p className="consumer-brand-note">专注于更简单的配置管理</p>
        </div>

        <nav className="consumer-nav" aria-label="主导航">
          <p className="consumer-nav-label">工作区</p>
          {navigation.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`consumer-nav-link${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="consumer-nav-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="consumer-nav-copy">
                  <strong>{item.label}</strong>
                  <small>{item.helper}</small>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="consumer-sidebar-user">
          <span className="consumer-avatar">林</span>
          <span className="consumer-sidebar-user-copy">
            <strong>林默</strong>
            <small>个人账户</small>
          </span>
          <button
            type="button"
            className="consumer-icon-button"
            aria-label="更多账户选项"
          >
            <Icon name="more" size={18} />
          </button>
        </div>
      </aside>

      <section className="consumer-workspace">
        <header className="consumer-topbar">
          <span className="consumer-topbar-context">个人工作区</span>
          <div className="consumer-topbar-actions">
            <button
              type="button"
              className="consumer-icon-button"
              aria-label="通知"
            >
              <Icon name="bell" />
              <span className="consumer-notification-dot" />
            </button>
            <span className="consumer-avatar consumer-avatar-small">林</span>
          </div>
        </header>

        <main
          className={`consumer-main${narrow ? ' consumer-main-narrow' : ''}`}
        >
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

        <footer className="consumer-footer">
          <span>Aisenhub · 让配置管理更简单</span>
          <span className="consumer-footer-links">
            <a href="#help">帮助中心</a>
            <a href="#privacy">隐私政策</a>
          </span>
        </footer>
      </section>
    </div>
  );
}

export { Icon };
