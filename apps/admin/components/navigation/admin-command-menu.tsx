'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ExternalLinkIcon, KeyboardIcon } from 'lucide-react';

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

import { adminNavigation } from './admin-navigation';

export function AdminCommandMenu({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
        description="导航到管理员控制台中的页面或安全操作。"
        className="sm:max-w-lg"
      >
        <Command>
          <CommandInput placeholder="搜索页面或动作…" />
          <CommandList>
            <CommandEmpty>没有匹配的页面或动作。</CommandEmpty>
            <CommandGroup heading="导航">
              {adminNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`${item.label} ${item.description}`}
                    data-test={`command-${item.href.split('/').pop()}`}
                    onSelect={() => navigate(item.href)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                    {pathname === item.href ? (
                      <CommandShortcut>当前页面</CommandShortcut>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="安全操作">
              <CommandItem
                value="安全设置 MFA 身份验证"
                data-test="command-security"
                onSelect={() => navigate('/admin/mfa')}
              >
                <ExternalLinkIcon />
                <span>打开安全设置</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
