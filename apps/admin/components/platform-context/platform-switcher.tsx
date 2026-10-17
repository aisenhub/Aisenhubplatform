'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Globe, RefreshCw, Search } from 'lucide-react';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Skeleton } from '@kit/ui/skeleton';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { mapAdminScopeRoute } from '../navigation/admin-navigation';
import { apiErrorDescription } from '../../features/resources/admin-resource-utils';
import type { Platform, PlatformListResponse } from './platform-types';
import {
  nextPlatformOptionIndex,
  platformOptionDomId,
  type PlatformOptionNavigationKey,
} from './platform-switcher-model';

type PlatformSwitcherProps = {
  current?: Platform | null;
  variant?: 'default' | 'sidebar';
};

const ALL_PLATFORMS_VALUE = '__ALL_PLATFORMS__';
const PLATFORM_PAGE_SIZE = 20;
const PLATFORM_SEARCH_DEBOUNCE_MS = 250;

function statusDotClass(status: string): string {
  return status === 'active' ? 'bg-success' : 'bg-muted-foreground';
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
  const listboxRef = useRef<HTMLDivElement>(null);
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!open || options.length === 0) {
      setActiveOptionId(null);
      return;
    }
    setActiveOptionId((active) => {
      if (active && options.some((option) => option.platform_id === active)) {
        return active;
      }
      return (
        options.find((option) => option.platform_id === current?.platform_id)
          ?.platform_id ?? options[0]!.platform_id
      );
    });
  }, [current?.platform_id, open, options]);

  useEffect(() => {
    if (!activeOptionId) return;
    document
      .getElementById(platformOptionDomId(activeOptionId))
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId]);

  function moveActiveOption(key: PlatformOptionNavigationKey) {
    if (!options.length) return;
    const currentIndex = options.findIndex(
      (option) => option.platform_id === activeOptionId,
    );
    const nextIndex = nextPlatformOptionIndex(
      currentIndex,
      options.length,
      key,
    );
    if (nextIndex >= 0) setActiveOptionId(options[nextIndex]!.platform_id);
  }

  function focusListbox(key: PlatformOptionNavigationKey) {
    setOpen(true);
    requestAnimationFrame(() => {
      moveActiveOption(key);
      listboxRef.current?.focus();
    });
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    focusListbox(event.key as PlatformOptionNavigationKey);
  }

  function handleListboxKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      moveActiveOption(event.key as PlatformOptionNavigationKey);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && activeOptionId) {
      event.preventDefault();
      changePlatform(activeOptionId);
    }
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    moveActiveOption(event.key as PlatformOptionNavigationKey);
    listboxRef.current?.focus();
  }

  function changePlatform(nextId: string) {
    if (!nextId) return;
    const targetId = nextId === ALL_PLATFORMS_VALUE ? null : nextId;
    setOpen(false);
    setQuery('');
    if (targetId && current?.platform_id === targetId) return;
    const destination = mapAdminScopeRoute(pathname, targetId);
    if (destination !== pathname) router.push(destination);
  }

  if (state === 'loading' && !current) {
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
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (open) setQuery('');
          setOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-label="切换平台工作区"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`platform-switcher-trigger ${variant === 'sidebar' ? 'platform-switcher-trigger-sidebar' : ''}`}
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
      </Button>

      {open && (
        <div
          className="platform-switcher-panel absolute left-0 top-full z-50 mt-1.5 max-h-96 w-full max-w-[calc(100vw-2rem)] overflow-y-auto p-1.5"
          role="dialog"
          aria-label="切换平台工作区"
          data-test="platform-switcher-dropdown"
        >
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            切换工作区
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={!current}
            data-selected={!current ? 'true' : 'false'}
            onClick={() => changePlatform(ALL_PLATFORMS_VALUE)}
            className="w-full justify-between px-2 text-left text-xs"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <span className="font-medium">所有平台（全局透镜）</span>
            </div>
            {!current && <Check className="h-3.5 w-3.5 text-primary" />}
          </Button>

          <div className="my-1 h-px bg-border" />

          <div className="px-1 py-1">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                data-test="platform-switcher-search-icon"
              />
              <Input
                aria-label="搜索平台"
                autoComplete="off"
                className="platform-switcher-search h-9 pl-10! pr-3 text-xs"
                data-test="platform-switcher-search"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索名称或代码"
                value={query}
              />
            </label>
          </div>

          <div
            ref={listboxRef}
            role="listbox"
            aria-label="平台工作区"
            aria-activedescendant={
              activeOptionId ? platformOptionDomId(activeOptionId) : undefined
            }
            tabIndex={0}
            onKeyDown={handleListboxKeyDown}
            data-test="platform-switcher-listbox"
          >
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
                <Button
                  key={platform.platform_id}
                  id={platformOptionDomId(platform.platform_id)}
                  type="button"
                  variant="ghost"
                  size="sm"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  data-active={activeOptionId === platform.platform_id}
                  onMouseMove={() => setActiveOptionId(platform.platform_id)}
                  onClick={() => changePlatform(platform.platform_id)}
                  className="w-full justify-between px-2 text-left text-xs"
                  data-selected={isSelected ? 'true' : 'false'}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {platform.name}
                  </span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </Button>
              );
            })}
            {nextCursor ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 w-full text-xs"
                data-test="platform-switcher-load-more"
                disabled={loadingMore || searching}
                onClick={() => void loadPlatforms(debouncedQuery, nextCursor)}
              >
                {loadingMore ? '正在加载…' : '加载更多'}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {state === 'error' && (
        <Alert className="mt-1 px-2 py-1.5 text-xs" variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{errorMessage}</span>
            <Button
              type="button"
              onClick={() => void loadPlatforms(debouncedQuery)}
              variant="ghost"
              size="icon-xs"
              aria-label="重试加载平台列表"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
