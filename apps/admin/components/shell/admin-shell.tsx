'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { SidebarProvider } from '@kit/ui/sidebar';

import { AdminSidebar } from './admin-sidebar';
import { AdminTopbar } from './admin-topbar';

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const isAuthFlow = pathname === '/admin/login' || pathname === '/admin/mfa';

  if (isAuthFlow) {
    return <div className="admin-auth-page">{children}</div>;
  }

  return (
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
  );
}
