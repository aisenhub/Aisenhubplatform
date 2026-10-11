'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

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
  useSidebar,
} from '@kit/ui/sidebar';

import {
  adminNavigationGroups,
  isAdminNavigationItemActive,
  parseAdminPlatformPath,
  platformNavigationGroups,
  type AdminNavigationGroup,
} from '../navigation/admin-navigation';
import { PlatformSwitcher } from '../platform-context/platform-switcher';
import { useAdminShellContext } from './admin-shell-context';

export function AdminSidebar() {
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);
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
      <SidebarHeader className="gap-3 border-b border-sidebar-border/70 p-3">
        <Link
          href="/admin"
          data-test="admin-brand"
          className="admin-sidebar-brand flex min-w-0 items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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

        <div className="admin-sidebar-platform-context group-data-[collapsible=icon]:hidden">
          <PlatformSwitcher current={currentPlatform} variant="sidebar" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavigationGroups groups={groups} pathname={pathname} />
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <div className="admin-sidebar-footer-card rounded-lg p-2.5 text-xs group-data-[collapsible=icon]:hidden">
          <div className="font-semibold text-slate-700">操作保护</div>
          <div className="mt-0.5 text-slate-500 leading-normal">
            敏感操作前可能需要再次验证身份。
          </div>
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
