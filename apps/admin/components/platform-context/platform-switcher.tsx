'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Globe, RefreshCw, Search } from 'lucide-react';

import { Alert, AlertDescription } from '@kit/ui/alert';
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
const PLATFORM_PAGE_SIZE = 20;
const PLATFORM_SEARCH_DEBOUNCE_MS = 250;

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
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadGeneration = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  // 点击外部自动收起下拉面板
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setQuery('');
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      PLATFORM_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadPlatforms = useCallback(
    async (search: string, cursor: string | null = null) => {
      const append = cursor !== null;
      const generation = ++loadGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      if (append) {
        setLoadingMore(true);
      } else {
        setSearching(true);
        setPlatforms([]);
        setNextCursor(null);
        setErrorMessage('');
      }

      try {
        const params = new URLSearchParams({
          limit: String(PLATFORM_PAGE_SIZE),
        });
        if (search) params.set('q', search);
        if (cursor) params.set('cursor', cursor);
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/platforms?${params.toString()}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const payload = (await response
          .json()
          .catch(() => null)) as PlatformListResponse | null;

        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok) {
          setState('error');
          setErrorMessage(
            apiErrorDescription(response, payload, '平台切换列表暂时不可用。'),
          );
          return;
        }

        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setPlatforms((current) => {
          if (!append) return rows;
          const byId = new Map(
            current.map((platform) => [platform.platform_id, platform]),
          );
          for (const platform of rows) byId.set(platform.platform_id, platform);
          return [...byId.values()];
        });
        setNextCursor(payload?.next_cursor ?? null);
        setState('ready');
        setErrorMessage('');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        setState('error');
        setErrorMessage(sessionErrorMessage(error));
      } finally {
        if (generation === loadGeneration.current) {
          setSearching(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadPlatforms(debouncedQuery);
    return () => controllerRef.current?.abort();
  }, [debouncedQuery, loadPlatforms]);

  const options = useMemo(() => {
    if (!current) return platforms;
    const normalized = debouncedQuery.toLocaleLowerCase();
    const currentMatches =
      !normalized ||
      `${current.name} ${current.code}`
        .toLocaleLowerCase()
        .includes(normalized);
    if (!currentMatches) return platforms;
    const hasCurrent = platforms.some(
      (platform) => platform.platform_id === current.platform_id,
    );
    return hasCurrent ? platforms : [current, ...platforms];
  }, [current, debouncedQuery, platforms]);

  function changePlatform(nextId: string) {
    if (!nextId) return;
    const targetId = nextId === ALL_PLATFORMS_VALUE ? null : nextId;
    setOpen(false);
    setQuery('');
    if (targetId && current?.platform_id === targetId) return;
    const destination = mapAdminScopeRoute(pathname, targetId);
    if (destination !== pathname) router.push(destination);
  }

  if (state === 'loading') {
    return (
      <Skeleton
        className={
          variant === 'sidebar'
            ? 'h-11 w-full rounded-lg'
            : 'h-9 w-48 rounded-md'
        }
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={
        variant === 'sidebar'
          ? 'platform-switcher admin-sidebar-platform-switcher relative w-full'
          : 'platform-switcher relative'
      }
      data-test="platform-switcher"
    >
      {/* 触发卡片按钮 */}
      <button
        type="button"
        onClick={() => {
          if (open) setQuery('');
          setOpen((prev) => !prev);
        }}
        aria-label="切换平台工作区"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={
          variant === 'sidebar'
            ? 'flex w-full items-center justify-between gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-2 text-left shadow-xs transition-colors hover:border-sidebar-border hover:bg-sidebar-accent focus:outline-hidden focus:ring-2 focus:ring-sidebar-ring'
            : 'flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent focus:outline-hidden focus:ring-2 focus:ring-ring/30'
        }
        data-test="platform-switcher-trigger"
      >
        {current ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary/20 font-mono text-xs font-bold text-sidebar-primary border border-sidebar-primary/30">
              {current.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-sidebar-foreground">
                  {current.name}
                </span>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(current.status)}`}
                  aria-label={
                    current.status === 'active' ? '平台启用' : '平台停用'
                  }
                />
              </div>
              <div className="truncate font-mono text-xs text-sidebar-foreground/70">
                {current.code}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-sidebar-foreground">
            <Globe className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">所有平台（全局透镜）</span>
          </div>
        )}
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
      </button>

      {/* 下拉浮层卡片（自主受控，零外部黑盒崩溃风险） */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 max-h-96 w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground p-1.5 shadow-lg"
          role="dialog"
          aria-label="切换平台工作区"
          data-test="platform-switcher-dropdown"
        >
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            切换工作区
          </div>

          <button
            type="button"
            aria-pressed={!current}
            onClick={() => changePlatform(ALL_PLATFORMS_VALUE)}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
              !current
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-foreground'
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <span className="font-medium">所有平台（全局透镜）</span>
            </div>
            {!current && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>

          <div className="my-1 h-px bg-border" />

          <div className="px-1 py-1">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                data-test="platform-switcher-search-icon"
              />
              <input
                aria-label="搜索平台"
                autoComplete="off"
                className="h-9 w-full rounded-md border border-input bg-background pl-10! pr-3 text-xs text-foreground placeholder:text-muted-foreground shadow-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                data-test="platform-switcher-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索名称或代码"
                value={query}
              />
            </label>
          </div>

          <div role="listbox" aria-label="平台工作区">
            <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              已加载平台 ({options.length})
            </div>
            {searching ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                正在搜索平台…
              </div>
            ) : null}
            {!searching && options.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                没有匹配的平台
              </div>
            ) : null}
            {options.map((platform) => {
              const isSelected = current?.platform_id === platform.platform_id;
              return (
                <button
                  key={platform.platform_id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => changePlatform(platform.platform_id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
                    isSelected
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-foreground'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {platform.name}
                  </span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
            {nextCursor ? (
              <button
                type="button"
                className="mt-1 flex w-full items-center justify-center rounded-md border border-border px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
                data-test="platform-switcher-load-more"
                disabled={loadingMore || searching}
                onClick={() => void loadPlatforms(debouncedQuery, nextCursor)}
              >
                {loadingMore ? '正在加载…' : '加载更多'}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {state === 'error' && (
        <Alert className="mt-1 px-2 py-1.5 text-xs" variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => void loadPlatforms(debouncedQuery)}
              className="text-xs underline hover:opacity-80"
              aria-label="重试加载平台列表"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
