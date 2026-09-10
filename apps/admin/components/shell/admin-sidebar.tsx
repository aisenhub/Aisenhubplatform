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
    <Sidebar collapsible="icon" variant="sidebar" data-test="admin-sidebar">
      <SidebarHeader className="gap-3 border-b border-sidebar-border/70 p-4">
        <Link
          href="/admin"
          data-test="admin-brand"
          className="flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            A
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold">
              Aisenhub
            </span>
            <span className="block truncate text-xs text-sidebar-foreground/65">
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
        <div className="rounded-md bg-sidebar-accent/60 px-3 py-2 text-xs text-sidebar-foreground/75 group-data-[collapsible=icon]:hidden">
          <div className="font-medium text-sidebar-foreground">
            安全边界已启用
          </div>
          <div className="mt-1 leading-5">敏感操作仍需近期 MFA 验证。</div>
        </div>
      </SidebarFooter>
      <SidebarRail data-test="admin-sidebar-rail" />
    </Sidebar>
  );
}
