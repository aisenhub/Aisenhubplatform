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
  Search,
} from 'lucide-react';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@kit/ui/popover';
import { Skeleton } from '@kit/ui/skeleton';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { mapAdminScopeRoute } from '../navigation/admin-navigation';
import { apiErrorDescription } from '../../features/resources/admin-resource-utils';
import type { Platform, PlatformListResponse } from './platform-types';

type PlatformSwitcherProps = {
  current?: Platform | null;
  variant?: 'default' | 'sidebar';
};

const ALL_PLATFORMS_VALUE = '__ALL_PLATFORMS__';

function statusDotClass(status: string): string {
  return status === 'active' ? 'bg-emerald-500' : 'bg-slate-400';
}

export function PlatformSwitcher({
  current = null,
  variant = 'default',
}: PlatformSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

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
    if (!current) return platforms;
    const hasCurrent = platforms.some(
      (platform) => platform.platform_id === current.platform_id,
    );
    return hasCurrent ? platforms : [current, ...platforms];
  }, [current, platforms]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter((platform) =>
      `${platform.name} ${platform.code}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [options, query]);

  function changePlatform(nextId: string) {
    if (!nextId) return;
    const targetId = nextId === ALL_PLATFORMS_VALUE ? null : nextId;
    if (targetId && current?.platform_id === targetId) return;
    const destination = mapAdminScopeRoute(pathname, targetId);
    setOpen(false);
    if (destination !== pathname) router.push(destination);
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
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setQuery('');
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="切换平台工作区"
              data-test="platform-switcher-trigger"
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
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-teal-200/60 bg-teal-50 font-mono text-xs font-bold text-teal-750">
                {current.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-semibold text-slate-800">
                    {current.name}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(current.status)}`}
                    aria-label={
                      current.status === 'active' ? '平台启用' : '平台停用'
                    }
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
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-72 max-h-96 gap-0 overflow-y-auto p-1 shadow-lg"
        >
          <div className="px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">
            切换工作区
          </div>

          <button
            type="button"
            aria-pressed={!current}
            onClick={() => changePlatform(ALL_PLATFORMS_VALUE)}
            className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent focus:bg-accent focus:outline-hidden"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-teal-600" />
              <span className="font-medium">所有平台（全局透镜）</span>
            </div>
            {!current ? <Check className="h-3.5 w-3.5 text-teal-600" /> : null}
          </button>

          <div className="my-1 h-px bg-slate-100" />

          <div className="px-1.5 py-1">
            <label className="relative block">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                aria-label="搜索平台"
                autoComplete="off"
                className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-600/20"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索名称或代码"
                value={query}
              />
            </label>
          </div>

          <div role="listbox" aria-label="平台工作区">
            <div className="px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">
              已加载平台 ({filteredOptions.length}/{options.length})
            </div>
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-slate-400">
                没有匹配的平台
              </div>
            ) : null}
            {filteredOptions.map((platform) => {
              const isSelected = current?.platform_id === platform.platform_id;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  key={platform.platform_id}
                  onClick={() => changePlatform(platform.platform_id)}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent focus:bg-accent focus:outline-hidden ${
                    isSelected ? 'bg-teal-50 font-medium text-teal-800' : ''
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(platform.status)}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 truncate">
                      <span className="truncate">{platform.name}</span>
                      <span className="ml-1.5 font-mono text-[0.65rem] text-slate-400">
                        {platform.code}
                      </span>
                    </div>
                  </div>
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="my-1 h-px bg-slate-100" />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push('/admin/platforms');
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-accent hover:text-slate-900 focus:bg-accent focus:outline-hidden"
          >
            <Boxes className="h-3.5 w-3.5 text-slate-400" />
            <span>查看完整平台目录 →</span>
          </button>
        </PopoverContent>
      </Popover>

      {state === 'error' ? (
        <Alert className="mt-1 px-2 py-1.5 text-xs" variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => void loadPlatforms()}
              className="text-xs underline hover:opacity-80"
              aria-label="重试加载平台列表"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
