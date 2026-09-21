'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@kit/ui/sidebar';

import {
  adminGlobalUtilityNavigation,
  adminNavigationGroups,
  isAdminNavigationItemActive,
  parseAdminPlatformPath,
  platformNavigationGroups,
  type AdminNavigationGroup,
} from '../navigation/admin-navigation';
import { PlatformSwitcher } from '../platform-context/platform-switcher';
import { platformStatus } from '../platform-context/platform-types';
import { useAdminShellContext } from './admin-shell-context';

export function AdminSidebar() {
  const pathname = usePathname();
  const platformRoute = parseAdminPlatformPath(pathname);
  const { platform } = useAdminShellContext();
  const currentPlatform =
    platformRoute && platform?.platform_id === platformRoute.platformId
      ? platform
      : null;
  const groups = platformRoute
    ? platformNavigationGroups(platformRoute.platformId)
    : adminNavigationGroups;

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className="admin-sidebar"
      data-test="admin-sidebar"
    >
      <SidebarHeader className="gap-3 border-b border-sidebar-border/70 p-4">
        <Link
          href="/admin"
          data-test="admin-brand"
          className="admin-sidebar-brand flex min-w-0 items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="admin-sidebar-brand-mark shrink-0">A</span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="admin-sidebar-brand-name block truncate">
              Aisenhub
            </span>
            <span className="admin-sidebar-brand-note block truncate">
              管理控制台
            </span>
          </span>
        </Link>

        {platformRoute ? (
          <div className="admin-sidebar-platform-context grid gap-2 group-data-[collapsible=icon]:hidden">
            <Link
              href="/admin/platforms"
              className="admin-sidebar-back-link inline-flex w-fit items-center gap-1.5 rounded-md text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              data-test="admin-platform-back"
            >
              <ArrowLeft className="size-3.5" />
              所有平台
            </Link>
            {currentPlatform ? (
              <>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {currentPlatform.name}
                    </span>
                    <span
                      className="admin-sidebar-platform-status shrink-0"
                      data-status={currentPlatform.status}
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      {platformStatus(currentPlatform.status).label}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[0.68rem] text-sidebar-foreground/55">
                    {currentPlatform.code}
                  </div>
                </div>
                <PlatformSwitcher current={currentPlatform} variant="sidebar" />
              </>
            ) : (
              <div className="text-xs text-sidebar-foreground/60">
                正在读取平台上下文…
              </div>
            )}
          </div>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <NavigationGroups groups={groups} pathname={pathname} />
        {platformRoute ? (
          <>
            <SidebarSeparator className="my-1" />
            <NavigationGroups
              groups={[
                {
                  label: '全局管理',
                  items: adminGlobalUtilityNavigation,
                },
              ]}
              pathname={pathname}
            />
          </>
        ) : null}
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <div className="admin-sidebar-footer-card rounded-xl px-3 py-2 text-xs group-data-[collapsible=icon]:hidden">
          <div className="font-semibold">敏感操作</div>
          <div className="mt-1 leading-5">近期 MFA 由服务端按需验证。</div>
        </div>
      </SidebarFooter>
      <SidebarRail data-test="admin-sidebar-rail" />
    </Sidebar>
  );
}

function NavigationGroups({
  groups,
  pathname,
}: {
  groups: AdminNavigationGroup[];
  pathname: string;
}) {
  return groups.map((group) => (
    <SidebarGroup key={group.label}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isAdminNavigationItemActive(pathname, item);

            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.label}
                  data-test={`admin-nav-${item.key}`}
                  render={
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                    />
                  }
                >
                  <Icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
