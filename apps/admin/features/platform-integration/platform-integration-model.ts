import type { Platform } from '../../components/platform-context/platform-types';

export type IntegrationOriginFact = {
  status: string;
  oauth_callback_url: string | null;
  password_reset_url: string | null;
  email_confirmation_url: string | null;
};

export type IntegrationKeyFact = {
  status: string;
  deployment_confirmed_at: string | null;
};

export type IntegrationCommerceOfferFact = {
  status: string;
  price_status: string | null;
  mapping_status: string;
};

export type IntegrationStepStatus =
  | 'complete'
  | 'incomplete'
  | 'unknown'
  | 'external'
  | 'optional';

export type IntegrationStep = {
  key:
    | 'platform'
    | 'origins'
    | 'key'
    | 'deployment'
    | 'commerce'
    | 'consumer-runtime'
    | 'acceptance';
  label: string;
  status: IntegrationStepStatus;
  description: string;
};

export type PlatformIntegrationState = {
  centralSteps: IntegrationStep[];
  commerceStep: IntegrationStep;
  externalSteps: IntegrationStep[];
  completedCentralSteps: number;
  totalCentralSteps: number;
  percentage: number;
  centralReady: boolean;
  hasUnknownCentralFacts: boolean;
  nextStep: IntegrationStep | null;
};

export function derivePlatformIntegrationState({
  platform,
  origins,
  keys,
  offers,
}: {
  platform: Platform;
  origins?: IntegrationOriginFact[];
  keys?: IntegrationKeyFact[];
  offers?: IntegrationCommerceOfferFact[];
}): PlatformIntegrationState {
  const platformReady =
    platform.status === 'active' && platform.allow_activation === true;
  const activeOrigins = origins?.filter((origin) => origin.status === 'active');
  const originReady = activeOrigins?.some(
    (origin) =>
      Boolean(origin.oauth_callback_url) &&
      Boolean(origin.password_reset_url) &&
      Boolean(origin.email_confirmation_url),
  );
  const activeKeys = keys?.filter((key) => key.status === 'active');
  const keyReady = Boolean(activeKeys?.length);
  const deploymentReady = activeKeys?.some((key) =>
    Boolean(key.deployment_confirmed_at),
  );

  const centralSteps: IntegrationStep[] = [
    {
      key: 'platform',
      label: '平台策略',
      status: platformReady ? 'complete' : 'incomplete',
      description: platformReady
        ? '平台运行中，并允许普通账户激活。'
        : '需要平台处于运行中，并允许账户激活。',
    },
    {
      key: 'origins',
      label: '域名与回调',
      status:
        origins === undefined
          ? 'unknown'
          : originReady
            ? 'complete'
            : 'incomplete',
      description:
        origins === undefined
          ? '当前无法确认 Origin 与回调配置。'
          : originReady
            ? '至少一个 active 环境已登记完整回调 URL。'
            : '需要至少一个 active Origin，并登记登录、重置与确认回调。',
    },
    {
      key: 'key',
      label: '服务端密钥',
      status:
        keys === undefined ? 'unknown' : keyReady ? 'complete' : 'incomplete',
      description:
        keys === undefined
          ? '当前无法确认 Platform Key metadata。'
          : keyReady
            ? '当前存在 active Platform Key。'
            : '需要创建一个 server-only Platform Key。',
    },
    {
      key: 'deployment',
      label: '部署确认',
      status:
        keys === undefined
          ? 'unknown'
          : deploymentReady
            ? 'complete'
            : 'incomplete',
      description:
        keys === undefined
          ? '当前无法确认 Key 部署状态。'
          : deploymentReady
            ? '至少一个 active Key 已记录部署确认。'
            : 'Key 部署到目标平台服务端/BFF 后，需要执行部署确认。',
    },
  ];

  const commerceConfigured = Boolean(
    offers?.some(
      (offer) =>
        offer.status === 'active' &&
        offer.price_status === 'active' &&
        offer.mapping_status === 'ready',
    ),
  );
  const commerceStep: IntegrationStep = {
    key: 'commerce',
    label: '商业配置（按需）',
    status:
      offers === undefined
        ? 'unknown'
        : commerceConfigured
          ? 'complete'
          : 'optional',
    description:
      offers === undefined
        ? '当前无法确认商业 Offer/Price/Mapping readiness；它不阻塞基础接入。'
        : commerceConfigured
          ? '至少一个 active paid Plan 已有 active Offer + Price + ready Provider Mapping。'
          : '免费平台可跳过；需要付费能力时再配置 paid Plan、Offer/Price 与 Provider Mapping。',
  };

  const externalSteps: IntegrationStep[] = [
    {
      key: 'consumer-runtime',
      label: '目标平台联调',
      status: 'external',
      description:
        '需要目标平台实现并验证 Auth session、principal、activate 与至少一个受保护服务端请求。',
    },
    {
      key: 'acceptance',
      label: '独立平台验收',
      status: 'external',
      description:
        '需要在目标平台仓库执行自己的 build、Auth/BFF、Local Supabase 与 E2E 验收；中央页面不代替该证据。',
    },
  ];

  const completedCentralSteps = centralSteps.filter(
    (step) => step.status === 'complete',
  ).length;
  const totalCentralSteps = centralSteps.length;
  const hasUnknownCentralFacts = centralSteps.some(
    (step) => step.status === 'unknown',
  );
  const nextStep =
    centralSteps.find((step) => step.status === 'unknown') ??
    centralSteps.find((step) => step.status === 'incomplete') ??
    null;

  return {
    centralSteps,
    commerceStep,
    externalSteps,
    completedCentralSteps,
    totalCentralSteps,
    percentage: Math.round((completedCentralSteps / totalCentralSteps) * 100),
    centralReady: completedCentralSteps === totalCentralSteps,
    hasUnknownCentralFacts,
    nextStep,
  };
}

export function integrationStatusLabel(status: IntegrationStepStatus): string {
  switch (status) {
    case 'complete':
      return '已满足';
    case 'incomplete':
      return '待完成';
    case 'unknown':
      return '无法确认';
    case 'external':
      return '需外部验证';
    case 'optional':
      return '按需配置';
  }
}
