'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部自动收起下拉面板
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

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

    try {
      const currentPath = pathname ?? '';

      if (nextId === ALL_PLATFORMS_VALUE) {
        if (current) {
          // 返回全局视口。如果是单平台概览，直接回 /admin，否则回 /admin/platforms
          const isPlatformOverview =
            currentPath ===
            `/admin/platforms/${encodeURIComponent(current.platform_id)}`;
          router.push(isPlatformOverview ? '/admin' : '/admin/platforms');
        }
        return;
      }

      if (current && nextId === current.platform_id) return;

      if (current) {
        const prefix = `/admin/platforms/${encodeURIComponent(current.platform_id)}`;
        const suffix = currentPath.startsWith(prefix)
          ? currentPath.slice(prefix.length)
          : '';
        router.push(`/admin/platforms/${encodeURIComponent(nextId)}${suffix}`);
      } else {
        router.push(`/admin/platforms/${encodeURIComponent(nextId)}`);
      }
    } catch (err) {
      console.error('Failed to change platform route:', err);
    }
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
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        className={
          variant === 'sidebar'
            ? 'flex w-full items-center justify-between gap-2.5 rounded-lg border border-slate-200/90 bg-white p-2 text-left shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-600/30'
            : 'flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-xs hover:bg-accent focus:outline-hidden focus:ring-2 focus:ring-teal-600/30'
        }
        data-test="platform-switcher-trigger"
      >
        {current ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-50 font-mono text-xs font-bold text-teal-800 border border-teal-200/60">
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
      </button>

      {/* 下拉浮层卡片（自主受控，零外部黑盒崩溃风险） */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-64 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
          role="menu"
          data-test="platform-switcher-dropdown"
        >
          <div className="px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">
            切换工作区
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              changePlatform(ALL_PLATFORMS_VALUE);
              setOpen(false);
            }}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-100 ${
              !current
                ? 'bg-teal-50/80 font-medium text-teal-800'
                : 'text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-teal-600" />
              <span className="font-medium">所有平台（全局透镜）</span>
            </div>
            {!current && <Check className="h-3.5 w-3.5 text-teal-600" />}
          </button>

          <div className="my-1 h-px bg-slate-100" />

          <div>
            <div className="px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">
              平台工作区 ({options.length})
            </div>
            {options.map((platform) => {
              const isSelected = current?.platform_id === platform.platform_id;
              return (
                <button
                  key={platform.platform_id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    changePlatform(platform.platform_id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-100 ${
                    isSelected
                      ? 'bg-teal-50 font-medium text-teal-800'
                      : 'text-slate-700'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
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
                </button>
              );
            })}
          </div>

          <div className="my-1 h-px bg-slate-100" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              router.push('/admin/platforms');
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <Boxes className="h-3.5 w-3.5 text-slate-400" />
            <span>查看完整平台目录 →</span>
          </button>
        </div>
      )}

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
