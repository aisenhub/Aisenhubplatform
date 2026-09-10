'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Label } from '@kit/ui/label';
import { Skeleton } from '@kit/ui/skeleton';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { apiErrorDescription } from '../../features/resources/admin-resource-utils';
import type { Platform, PlatformListResponse } from './platform-types';

type PlatformSwitcherProps = {
  current: Platform;
};

export function PlatformSwitcher({ current }: PlatformSwitcherProps) {
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
          response.status === 401
            ? '会话已结束，请重新登录后再切换平台。'
            : response.status === 403
              ? '当前账号没有平台目录访问权限。'
              : apiErrorDescription(
                  response,
                  payload,
                  '平台切换列表暂时不可用。',
                ),
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
    const hasCurrent = platforms.some(
      (platform) => platform.platform_id === current.platform_id,
    );
    return hasCurrent ? platforms : [current, ...platforms];
  }, [current, platforms]);

  function changePlatform(nextId: string) {
    if (!nextId || nextId === current.platform_id) return;
    const prefix = `/admin/platforms/${current.platform_id}`;
    const suffix = pathname.startsWith(prefix)
      ? pathname.slice(prefix.length)
      : '';
    router.push(`/admin/platforms/${encodeURIComponent(nextId)}${suffix}`);
  }

  return (
    <div className="grid min-w-44 gap-1.5 sm:min-w-56">
      <Label
        htmlFor="platform-switcher"
        className="text-xs text-muted-foreground"
      >
        当前平台
      </Label>
      {state === 'loading' ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <select
          id="platform-switcher"
          value={current.platform_id}
          onChange={(event) => changePlatform(event.target.value)}
          disabled={state === 'error' || options.length < 2}
          data-test="platform-switcher"
          aria-describedby={
            state === 'error' ? 'platform-switcher-error' : undefined
          }
        >
          {options.map((platform) => (
            <option key={platform.platform_id} value={platform.platform_id}>
              {platform.name} · {platform.code}
            </option>
          ))}
        </select>
      )}
      {state === 'error' ? (
        <Alert
          id="platform-switcher-error"
          className="mt-1 px-2 py-1.5 text-xs"
          data-test="platform-switcher-error"
        >
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
