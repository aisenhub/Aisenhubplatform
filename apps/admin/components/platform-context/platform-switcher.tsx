'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Boxes,
  Check,
  ChevronsUpDown,
  Globe,
  Layers,
  RefreshCw,
} from 'lucide-react';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Skeleton } from '@kit/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { apiErrorDescription } from '../../features/resources/admin-resource-utils';
import type { Platform, PlatformListResponse } from './platform-types';

type PlatformSwitcherProps = {
  current?: Platform | null;
  variant?: 'default' | 'sidebar';
};

const ALL_PLATFORMS_VALUE = '__ALL_PLATFORMS__';

export function PlatformSwitcher({
  current = null,
  variant = 'default',
}: PlatformSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const loadPlatforms = useCallback(async () => {
    const epoch = adminAuthSession.getEpoch();

    try {
      const response = await adminAuthSession.request(
        '/api/v1/admin/api/v1/platforms?limit=100',
        { cache: 'no-store' },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as PlatformListResponse | null;

      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      if (!response.ok) {
        setState('error');
        setErrorMessage(
          apiErrorDescription(response, payload, '平台切换列表暂时不可用。'),
        );
        return;
      }

      setPlatforms(Array.isArray(payload?.data) ? payload.data : []);
      setState('ready');
      setErrorMessage('');
    } catch (error) {
      setState('error');
      setErrorMessage(sessionErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  const options = useMemo(() => {
    if (!current) {
      return platforms;
    }
    const hasCurrent = platforms.some(
      (platform) => platform.platform_id === current.platform_id,
    );
    return hasCurrent ? platforms : [current, ...platforms];
  }, [current, platforms]);

  function changePlatform(nextId: string) {
    if (!nextId) return;

    if (nextId === ALL_PLATFORMS_VALUE) {
      if (current) {
        // Return to global view. If at platform overview, go to global overview; otherwise to directory.
        const isPlatformOverview =
          pathname ===
          `/admin/platforms/${encodeURIComponent(current.platform_id)}`;
        router.push(isPlatformOverview ? '/admin' : '/admin/platforms');
      }
      return;
    }

    if (current && nextId === current.platform_id) return;

    if (current) {
      const prefix = `/admin/platforms/${encodeURIComponent(current.platform_id)}`;
      const suffix = pathname.startsWith(prefix)
        ? pathname.slice(prefix.length)
        : '';
      router.push(`/admin/platforms/${encodeURIComponent(nextId)}${suffix}`);
    } else {
      router.push(`/admin/platforms/${encodeURIComponent(nextId)}`);
    }
  }

  if (state === 'loading') {
    return (
      <Skeleton
        className={
          variant === 'sidebar'
            ? 'h-12 w-full rounded-lg'
            : 'h-9 w-48 rounded-md'
        }
      />
    );
  }

  return (
    <div
      className={
        variant === 'sidebar'
          ? 'platform-switcher admin-sidebar-platform-switcher w-full'
          : 'platform-switcher'
      }
      data-test="platform-switcher"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={
                variant === 'sidebar'
                  ? 'flex w-full items-center justify-between gap-2.5 rounded-lg border border-slate-200/90 bg-white p-2 text-left shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-600/30'
                  : 'flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent'
              }
            />
          }
        >
          {current ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-50 font-mono text-xs font-bold text-teal-750 border border-teal-200/60">
                {current.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-semibold text-slate-800">
                    {current.name}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      current.status === 'active'
                        ? 'bg-emerald-500'
                        : 'bg-rose-500'
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <div className="truncate font-mono text-[0.68rem] text-slate-400">
                  {current.code}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-slate-700">
              <Globe className="h-4 w-4 shrink-0 text-teal-600" />
              <span className="truncate">所有平台（全局透镜）</span>
            </div>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="w-64 max-h-80 overflow-y-auto p-1 shadow-lg"
        >
          <DropdownMenuLabel className="text-[0.68rem] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
            切换工作区
          </DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => changePlatform(ALL_PLATFORMS_VALUE)}
            className="flex items-center justify-between px-2 py-1.5 cursor-pointer rounded-md text-xs"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-teal-600" />
              <span className="font-medium">所有平台（全局透镜）</span>
            </div>
            {!current && <Check className="h-3.5 w-3.5 text-teal-600" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1 bg-slate-100" />

          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[0.68rem] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
              平台工作区 ({options.length})
            </DropdownMenuLabel>
            {options.map((platform) => {
              const isSelected = current?.platform_id === platform.platform_id;
              return (
                <DropdownMenuItem
                  key={platform.platform_id}
                  onClick={() => changePlatform(platform.platform_id)}
                  className={`flex items-center justify-between px-2 py-1.5 cursor-pointer rounded-md text-xs ${
                    isSelected ? 'bg-teal-50 font-medium text-teal-800' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <div className="min-w-0 truncate">
                      <span className="truncate">{platform.name}</span>
                      <span className="ml-1.5 font-mono text-[0.65rem] text-slate-400">
                        {platform.code}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-1 bg-slate-100" />

          <DropdownMenuItem
            onClick={() => router.push('/admin/platforms')}
            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md text-xs text-slate-600 hover:text-slate-900"
          >
            <Boxes className="h-3.5 w-3.5 text-slate-400" />
            <span>查看完整平台目录 →</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {state === 'error' && (
        <Alert className="mt-1 px-2 py-1.5 text-xs" variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => void loadPlatforms()}
              className="text-xs underline hover:opacity-80"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
