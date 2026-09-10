'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';

import { AdminPageHeader } from '../shell/admin-page-header';
import {
  adminAuthSession,
  sessionErrorMessage,
  useAdminSessionSnapshot,
} from '../../app/_lib/auth-session';
import { PlatformHeader } from './platform-header';
import type { Platform, PlatformResponse } from './platform-types';
import { apiErrorDescription } from '../../features/resources/admin-resource-utils';

type WorkspaceState = 'loading' | 'success' | 'access' | 'not-found' | 'error';

type WorkspaceError = {
  title: string;
  description: string;
  requestId: string | null;
  technicalDetail: string | null;
};

type PlatformWorkspaceContextValue = {
  platform: Platform;
  reload: () => void;
};

const PlatformWorkspaceContext =
  createContext<PlatformWorkspaceContextValue | null>(null);

export function usePlatformContext(): PlatformWorkspaceContextValue {
  const context = useContext(PlatformWorkspaceContext);
  if (!context) {
    throw new Error('usePlatformContext must be used inside PlatformWorkspace');
  }
  return context;
}

type PlatformWorkspaceProps = {
  platformId: string;
  children: ReactNode;
};

export function PlatformWorkspace({
  platformId,
  children,
}: PlatformWorkspaceProps) {
  const sessionSnapshot = useAdminSessionSnapshot();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [state, setState] = useState<WorkspaceState>('loading');
  const [error, setError] = useState<WorkspaceError | null>(null);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionIsTerminal =
    sessionSnapshot.resolved &&
    ['unauthenticated', 'expired'].includes(sessionSnapshot.state);

  const load = useCallback(
    async (preserveCurrent = false) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const epoch = adminAuthSession.getEpoch();
      const keepCurrentContext = preserveCurrent;

      setError(null);
      if (!keepCurrentContext) {
        setPlatform(null);
        setState('loading');
      }

      try {
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const payload = (await response
          .json()
          .catch(() => null)) as PlatformResponse | null;
        const requestId =
          response.headers.get('x-request-id') ?? payload?.request_id ?? null;

        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;

        if (!response.ok || !payload?.data) {
          const nextError: WorkspaceError =
            response.status === 401
              ? {
                  title: '会话已结束',
                  description: '请重新登录后再打开平台工作区。',
                  requestId,
                  technicalDetail:
                    payload?.error?.code ?? `HTTP_${response.status}`,
                }
              : response.status === 403
                ? {
                    title: '没有平台访问权限',
                    description: '当前管理员账号不能访问这个平台上下文。',
                    requestId,
                    technicalDetail: payload?.error?.code ?? 'FORBIDDEN',
                  }
                : response.status === 404
                  ? {
                      title: '平台不存在',
                      description:
                        'URL 中的平台 ID 未找到。页面不会回退到其他平台或继续显示旧数据。',
                      requestId,
                      technicalDetail:
                        payload?.error?.code ?? 'PLATFORM_NOT_FOUND',
                    }
                  : {
                      title: '平台上下文暂时不可用',
                      description: apiErrorDescription(
                        response,
                        payload,
                        '请检查网络或服务状态后重试；当前页面不会显示不属于此平台的数据。',
                      ),
                      requestId,
                      technicalDetail:
                        payload?.error?.code ?? `HTTP_${response.status}`,
                    };

          setError(nextError);
          if (!keepCurrentContext) {
            setState(
              response.status === 401 || response.status === 403
                ? 'access'
                : response.status === 404
                  ? 'not-found'
                  : 'error',
            );
          }
          return;
        }

        setPlatform(payload.data);
        setState('success');
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (
          generation !== generationRef.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        setError({
          title: '平台上下文读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
        if (!keepCurrentContext) setState('error');
      }
    },
    [platformId],
  );

  useEffect(() => {
    if (!sessionIsTerminal) return;
    controllerRef.current?.abort();
    generationRef.current += 1;
    setPlatform(null);
    setError({
      title: '会话已结束',
      description: '请重新登录后再打开平台工作区。',
      requestId: null,
      technicalDetail: null,
    });
    setState('access');
  }, [sessionIsTerminal]);

  useEffect(() => {
    if (sessionIsTerminal) return;
    void load();
    return () => {
      controllerRef.current?.abort();
      generationRef.current += 1;
    };
  }, [load, sessionIsTerminal]);

  const contextValue = useMemo(
    () => (platform ? { platform, reload: () => void load(true) } : null),
    [load, platform],
  );

  if (state !== 'success' || !platform || !contextValue) {
    return (
      <main className="shell wide-shell" data-test="platform-workspace-state">
        <AdminPageHeader
          title="平台工作区"
          description="平台上下文由 URL 中的 platformId 唯一决定。"
          actions={
            <Button
              variant="outline"
              size="sm"
              disabled={state === 'loading'}
              onClick={() => void load()}
              data-test="platform-context-retry"
            >
              {state === 'loading' ? '读取中…' : '重试'}
            </Button>
          }
        />
        {state === 'loading' ? <AsyncState state="loading" /> : null}
        {state === 'access' && error ? (
          <AsyncState
            state="access"
            title={error.title}
            description={error.description}
            requestId={error.requestId}
            technicalDetail={error.technicalDetail}
          />
        ) : null}
        {state === 'not-found' && error ? (
          <AsyncState
            state="error"
            title={error.title}
            description={error.description}
            requestId={error.requestId}
            technicalDetail={error.technicalDetail}
            onRetry={() => void load()}
          />
        ) : null}
        {state === 'error' && error ? (
          <AsyncState
            state="error"
            title={error.title}
            description={error.description}
            requestId={error.requestId}
            technicalDetail={error.technicalDetail}
            onRetry={() => void load()}
          />
        ) : null}
        <Button
          variant="link"
          className="w-fit px-0"
          render={<Link href="/admin/platforms" />}
        >
          返回平台目录
        </Button>
      </main>
    );
  }

  return (
    <PlatformWorkspaceContext.Provider value={contextValue}>
      <main className="shell wide-shell" data-test="platform-workspace">
        <PlatformHeader platform={platform} />
        {error ? (
          <div className="mb-5">
            <AsyncState
              state="error"
              title={error.title}
              description={error.description}
              requestId={error.requestId}
              technicalDetail={error.technicalDetail}
              onRetry={() => void load(true)}
            />
          </div>
        ) : null}
        {children}
      </main>
    </PlatformWorkspaceContext.Provider>
  );
}
