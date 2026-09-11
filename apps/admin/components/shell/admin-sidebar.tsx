'use client';

import Link from 'next/link';
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
} from '@kit/ui/sidebar';

import { adminNavigationGroups } from '../navigation/admin-navigation';

export function AdminSidebar() {
  const pathname = usePathname();

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
              管理员控制台
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {adminNavigationGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== '/admin' &&
                      pathname.startsWith(`${item.href}/`));

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        data-test={`admin-nav-${item.href.split('/').pop()}`}
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
        ))}
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <div className="admin-sidebar-footer-card rounded-xl px-3 py-2 text-xs group-data-[collapsible=icon]:hidden">
          <div className="font-semibold">安全边界已启用</div>
          <div className="mt-1 leading-5">敏感操作仍需近期 MFA 验证。</div>
        </div>
      </SidebarFooter>
      <SidebarRail data-test="admin-sidebar-rail" />
    </Sidebar>
  );
}
