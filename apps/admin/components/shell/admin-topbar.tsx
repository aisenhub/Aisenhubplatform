'use client';

import { usePathname, useRouter } from 'next/navigation';

import { useState } from 'react';

import { Button } from '@kit/ui/button';
import { Separator } from '@kit/ui/separator';
import { SidebarTrigger } from '@kit/ui/sidebar';

import { adminAuthSession } from '../../app/_lib/auth-session';
import { adminNavigationLabel } from '../navigation/admin-navigation';
import { AdminCommandMenu } from '../navigation/admin-command-menu';

export function AdminTopbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const pageLabel = adminNavigationLabel(pathname);

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
      className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-border/70 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"
      data-test="admin-topbar"
    >
      <SidebarTrigger data-test="admin-sidebar-toggle" />
      <Separator orientation="vertical" className="hidden h-5 sm:block" />
      <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground lg:flex">
        <span>Aisenhub</span>
        <span aria-hidden="true">/</span>
        <span className="truncate font-medium text-foreground">
          {pageLabel}
        </span>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div className="lg:hidden min-w-0 truncate">
          <span className="sr-only">当前页面：</span>
          <span className="text-sm font-medium">{pageLabel}</span>
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
