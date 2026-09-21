'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@kit/ui/button';
import { Separator } from '@kit/ui/separator';
import { SidebarTrigger } from '@kit/ui/sidebar';

import { adminAuthSession } from '../../app/_lib/auth-session';
import {
  adminNavigationLabel,
  parseAdminPlatformPath,
} from '../navigation/admin-navigation';
import { AdminCommandMenu } from '../navigation/admin-command-menu';
import { useAdminShellContext } from './admin-shell-context';

export function AdminTopbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { platform } = useAdminShellContext();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const pageLabel = adminNavigationLabel(pathname);
  const platformRoute = parseAdminPlatformPath(pathname);
  const platformLabel =
    platformRoute && platform?.platform_id === platformRoute.platformId
      ? platform.name
      : '平台工作区';
  const contextSegments = platformRoute
    ? ['Aisenhub', platformLabel, pageLabel]
    : ['Aisenhub', pageLabel];

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(false);
    try {
      const response = await adminAuthSession.logout();
      if (response.ok) {
        router.replace('/admin/login');
      } else {
        setLogoutError(true);
      }
    } catch {
      setLogoutError(true);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header
      className="admin-topbar sticky top-0 z-20 flex items-center gap-3 border-b border-border/70 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"
      data-test="admin-topbar"
    >
      <SidebarTrigger data-test="admin-sidebar-toggle" />
      <Separator orientation="vertical" className="hidden h-5 sm:block" />
      <div className="admin-topbar-context hidden min-w-0 items-center gap-2 lg:flex">
        {contextSegments.map((segment, index) => (
          <span
            key={`context-${segment}-${index}`}
            className="inline-flex min-w-0 items-center gap-2"
          >
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {index === contextSegments.length - 1 ? (
              <strong className="truncate">{segment}</strong>
            ) : (
              <span className="truncate">{segment}</span>
            )}
          </span>
        ))}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div className="min-w-0 truncate lg:hidden">
          <span className="sr-only">当前页面：</span>
          <span className="text-sm font-semibold">{pageLabel}</span>
        </div>
        <AdminCommandMenu compact />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void logout()}
          disabled={loggingOut}
          data-test="admin-logout"
        >
          {loggingOut ? '退出中…' : '退出登录'}
        </Button>
        {logoutError ? (
          <span className="text-xs text-destructive" role="alert">
            退出失败，请重试
          </span>
        ) : null}
      </div>
    </header>
  );
}
