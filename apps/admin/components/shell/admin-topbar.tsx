'use client';

import { usePathname } from 'next/navigation';

import { Separator } from '@kit/ui/separator';
import { SidebarTrigger } from '@kit/ui/sidebar';

import { adminNavigationLabel } from '../navigation/admin-navigation';
import { AdminCommandMenu } from '../navigation/admin-command-menu';

export function AdminTopbar() {
  const pathname = usePathname();
  const pageLabel = adminNavigationLabel(pathname);

  return (
    <header
      className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-border/70 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"
      data-test="admin-topbar"
    >
      <SidebarTrigger data-test="admin-sidebar-toggle" />
      <Separator orientation="vertical" className="hidden h-5 sm:block" />
      <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground sm:flex">
        <span>Aisenhub</span>
        <span aria-hidden="true">/</span>
        <span className="truncate font-medium text-foreground">
          {pageLabel}
        </span>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div className="sm:hidden">
          <span className="sr-only">当前页面：</span>
          <span className="text-sm font-medium">{pageLabel}</span>
        </div>
        <AdminCommandMenu compact />
      </div>
    </header>
  );
}
