'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { KeyboardIcon } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@kit/ui/command';
import { Kbd } from '@kit/ui/kbd';

import {
  adminNavigation,
  isAdminNavigationItemActive,
  parseAdminPlatformPath,
  platformNavigationGroups,
} from './admin-navigation';

export function AdminCommandMenu({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const platformRoute = parseAdminPlatformPath(pathname);
  const platformItems = platformRoute
    ? platformNavigationGroups(platformRoute.platformId).flatMap(
        (group) => group.items,
      )
    : [];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-test="admin-command-trigger"
        className={
          compact
            ? 'size-8 justify-center px-0 text-muted-foreground lg:w-56 lg:justify-between lg:px-2.5'
            : 'w-full justify-between gap-3 text-muted-foreground sm:w-56'
        }
        onClick={() => setOpen(true)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <KeyboardIcon className="size-4" />
          <span className={compact ? 'hidden truncate sm:inline' : 'truncate'}>
            快速跳转
          </span>
        </span>
        <Kbd className="hidden sm:inline-flex">Ctrl K</Kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="快速跳转"
        description="导航到全局管理或当前平台的工作区。"
        className="sm:max-w-lg"
      >
        <Command>
          <CommandInput placeholder="搜索页面…" />
          <CommandList>
            <CommandEmpty>没有匹配的页面。</CommandEmpty>
            {platformItems.length ? (
              <>
                <CommandGroup heading="当前平台">
                  {platformItems.map((item) => {
                    const Icon = item.icon;
                    const active = isAdminNavigationItemActive(pathname, item);
                    return (
                      <CommandItem
                        key={item.key}
                        value={`${item.label} ${item.description}`}
                        data-test={`command-platform-${item.key}`}
                        onSelect={() => navigate(item.href)}
                      >
                        <Icon />
                        <span>{item.label}</span>
                        {active ? (
                          <CommandShortcut>当前页面</CommandShortcut>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            <CommandGroup heading="全局导航">
              {adminNavigation.map((item) => {
                const Icon = item.icon;
                const active = isAdminNavigationItemActive(pathname, item);
                return (
                  <CommandItem
                    key={item.key}
                    value={`${item.label} ${item.description}`}
                    data-test={`command-${item.key}`}
                    onSelect={() => navigate(item.href)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                    {active ? (
                      <CommandShortcut>当前页面</CommandShortcut>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
