'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { StatusBadge } from '@kit/ui/status-badge';

import { adminAuthSession } from '../../app/_lib/auth-session';
import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { readApiPayload } from '../resources/admin-resource-utils';
import {
  beginScopedLoad,
  isScopedLoadCurrent,
} from '../resources/scoped-load-guard';
import {
  derivePlatformIntegrationState,
  integrationStatusLabel,
  type IntegrationKeyFact,
  type IntegrationCommerceOfferFact,
  type IntegrationOriginFact,
  type IntegrationStep,
} from './platform-integration-model';
import {
  PlatformOriginsSection,
  type Origin,
} from '../origins/platform-origins-page';
import {
  PlatformKeysSection,
  type PlatformKey,
} from '../platform-keys/platform-keys-page';

function toneForStep(status: IntegrationStep['status']) {
  switch (status) {
    case 'complete':
      return 'success' as const;
    case 'incomplete':
      return 'warning' as const;
    case 'unknown':
      return 'unknown' as const;
    case 'external':
      return 'info' as const;
    case 'optional':
      return 'neutral' as const;
  }
}

export function PlatformIntegrationPage() {
  const { platform } = usePlatformContext();
  const searchParams = useSearchParams();
  const welcome = searchParams.get('welcome') === '1';
  const [origins, setOrigins] = useState<IntegrationOriginFact[] | undefined>();
  const [keys, setKeys] = useState<IntegrationKeyFact[] | undefined>();
  const [offers, setOffers] = useState<
    IntegrationCommerceOfferFact[] | undefined
  >();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const commerceLoadGeneration = useRef(0);
  const commerceScopeRef = useRef(platform.platform_id);
  commerceScopeRef.current = platform.platform_id;

  const loadCommerce = useCallback(async () => {
    const token = beginScopedLoad(commerceLoadGeneration, platform.platform_id);
    const epoch = adminAuthSession.getEpoch();
    setOffers(undefined);
    try {
      const offersResponse = await adminAuthSession.request(
        `/api/v1/admin/api/v1/platforms/${encodeURIComponent(token.scope)}/commerce/offers`,
        { cache: 'no-store' },
      );
      const offersPayload =
        await readApiPayload<IntegrationCommerceOfferFact[]>(offersResponse);
      if (
        !isScopedLoadCurrent(commerceLoadGeneration, commerceScopeRef, token) ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      setOffers(
        offersResponse.ok && Array.isArray(offersPayload?.data)
          ? offersPayload.data
          : undefined,
      );
    } catch {
      if (
        !isScopedLoadCurrent(commerceLoadGeneration, commerceScopeRef, token) ||
        !adminAuthSession.isCurrentEpoch(epoch)
      )
        return;
      setOffers(undefined);
    }
  }, [platform.platform_id]);

  useEffect(() => {
    void loadCommerce();
  }, [loadCommerce]);

  useEffect(() => {
    const section = searchParams.get('section');
    if (section !== 'origins' && section !== 'keys') return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(section)?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [searchParams]);

  const handleOriginsChange = useCallback((next: Origin[]) => {
    setOrigins(next);
  }, []);
  const handleKeysChange = useCallback((next: PlatformKey[]) => {
    setKeys(next);
  }, []);

  function refreshAll() {
    setOrigins(undefined);
    setKeys(undefined);
    setOffers(undefined);
    setRefreshVersion((current) => current + 1);
    void loadCommerce();
  }

  const state = derivePlatformIntegrationState({
    platform,
    origins,
    keys,
    offers,
  });
  const encoded = encodeURIComponent(platform.platform_id);
  const nextHref =
    state.nextStep?.key === 'platform'
      ? `/admin/platforms/${encoded}/settings`
      : state.nextStep?.key === 'origins'
        ? '#origins'
        : '#keys';

  return (
    <section className="grid gap-5" data-test="platform-integration-page">
      <AdminPageHeader
        title="接入配置"
        description="用中央权威事实完成平台接入准备，并明确区分仍需目标平台独立验证的步骤。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            data-test="platform-integration-refresh"
          >
            刷新接入状态
          </Button>
        }
      />

      {welcome ? (
        <Alert data-test="platform-integration-welcome">
          <AlertTitle>平台已创建，继续完成首次接入</AlertTitle>
          <AlertDescription>
            下一步从域名/回调和 server-only Platform Key
            开始。中央页面不会把目标平台代码联调伪装成已完成。
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        className="panel gap-5"
        data-test="platform-integration-progress"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Central readiness
            </p>
            <h2 className="mt-2">
              {state.centralReady ? '中央准备已就绪' : '中央准备仍有待办'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              已满足 {state.completedCentralSteps}/{state.totalCentralSteps}{' '}
              项中央事实。
              {state.centralReady
                ? '这不等于目标平台已经通过联调或可运营。'
                : '完成下面的权威配置后，再到目标平台执行独立验收。'}
            </p>
          </div>
          <div className="min-w-32 text-right">
            <strong className="font-mono text-2xl">{state.percentage}%</strong>
            <div
              className="mt-2 h-2 w-32 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="中央接入准备进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={state.percentage}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${state.percentage}%` }}
              />
            </div>
          </div>
        </div>

        {state.nextStep ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-4">
            <div>
              <p className="text-xs text-muted-foreground">当前下一步</p>
              <p
                className="mt-1 font-medium"
                data-test="platform-integration-next"
              >
                {state.nextStep.label}
              </p>
            </div>
            <Button nativeButton={false} render={<Link href={nextHref} />}>
              去处理
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {[...state.centralSteps, state.commerceStep].map((step) => (
            <StepCard key={step.key} step={step} />
          ))}
        </div>
      </section>

      <PlatformOriginsSection
        key={`origins-${refreshVersion}`}
        embedded
        onFactsChange={handleOriginsChange}
      />

      <PlatformKeysSection
        key={`keys-${refreshVersion}`}
        embedded
        onFactsChange={handleKeysChange}
      />

      <section className="panel gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Target platform verification
          </p>
          <h2 className="mt-2">目标平台仍需独立验证</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            下面两项不提供手工“完成”按钮。请按
            `docs/guides/platform-onboarding.md`
            在目标平台仓库验证，再把真实测试记录留在目标项目中。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {state.externalSteps.map((step) => (
            <StepCard key={step.key} step={step} />
          ))}
        </div>
      </section>

      <section className="panel gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2>商业能力（按需）</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              免费平台不需要为了完成基础接入配置付费商品。需要售卖订阅时，再配置
              paid Plan、Offer/Price 与 Provider Mapping。
            </p>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/admin/platforms/${encoded}/plans`} />}
          >
            打开商业目录
          </Button>
        </div>
      </section>
    </section>
  );
}

function StepCard({ step }: { step: IntegrationStep }) {
  return (
    <article
      className="rounded-xl border border-border/70 bg-card p-4"
      data-test={`platform-integration-step-${step.key}`}
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm">{step.label}</strong>
        <StatusBadge
          label={integrationStatusLabel(step.status)}
          tone={toneForStep(step.status)}
          rawValue={step.status}
        />
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {step.description}
      </p>
    </article>
  );
}
