'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  isBillingCheckoutStatus,
  isBillingProductCode,
  isMoneyAmount,
  isSubscriptionProductList,
  type EntitlementDto,
  type SubscriptionCheckoutDto,
  type SubscriptionProductDto,
} from '@kit/domain/contracts';

import { ConsumerShell, Icon } from '../../components/consumer-shell';

type Product = SubscriptionProductDto & {
  accent: 'sage' | 'green' | 'clay';
  displayPrice: string;
};

type Entitlement = Pick<
  EntitlementDto,
  'effective_status' | 'plan' | 'subscription_product'
>;

type WorkspaceStatus =
  | 'unknown'
  | 'unauthorized'
  | 'not_activated'
  | 'active'
  | 'unavailable';

type ContributionPlan = {
  name: string;
  code: SubscriptionCheckoutDto['product_code'];
};

const activationCodePattern = /^[A-Z0-9-]{16,159}$/u;
type RedemptionState = 'idle' | 'invalid' | 'checking' | 'error';

type PendingPayment = {
  checkoutId: string;
  code: SubscriptionCheckoutDto['product_code'];
  name: string;
  status: SubscriptionCheckoutDto['status'];
  url: string | null;
  price?: SubscriptionCheckoutDto['price'];
  currency?: SubscriptionCheckoutDto['currency'];
  term?: SubscriptionCheckoutDto['term'];
};

type CheckoutStatus = Pick<
  SubscriptionCheckoutDto,
  'status' | 'paid_at' | 'granted_at' | 'price' | 'currency' | 'term'
>;

const pendingPaymentStorageKey = 'aisenhub.subscription.pending-payment';

function readPendingPayment(): PendingPayment | null {
  if (typeof window === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(pendingPaymentStorageKey) ?? 'null',
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const candidate = value as Record<string, unknown>;
    const code = candidate.code;
    const status = candidate.status;
    if (
      typeof candidate.checkoutId !== 'string' ||
      !isBillingProductCode(code) ||
      code === 'free' ||
      typeof candidate.name !== 'string' ||
      !isBillingCheckoutStatus(status)
    )
      return null;
    return {
      checkoutId: candidate.checkoutId,
      code,
      name: candidate.name,
      status,
      url: typeof candidate.url === 'string' ? candidate.url : null,
      ...(hasCheckoutSnapshot(candidate)
        ? {
            price: candidate.price,
            currency: candidate.currency,
            term: candidate.term,
          }
        : {}),
    };
  } catch {
    return null;
  }
}

function persistPendingPayment(payment: PendingPayment | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (payment)
      window.sessionStorage.setItem(
        pendingPaymentStorageKey,
        JSON.stringify(payment),
      );
    else window.sessionStorage.removeItem(pendingPaymentStorageKey);
  } catch {
    // Session storage is only a navigation convenience; checkout remains server-side.
  }
}

function accentFor(code: string): Product['accent'] {
  if (code === 'free') return 'sage';
  if (code === 'lifetime') return 'clay';
  return 'green';
}

function formatPrice(
  price: SubscriptionProductDto['price'],
  currency: SubscriptionProductDto['currency'],
): string {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return `${price} ${currency}`;
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericPrice);
}

function termLabel(term: SubscriptionProductDto['term']): string {
  if (term.kind === 'free') return '免费方案';
  if (!term.duration_value || !term.duration_unit) return '期限以服务端为准';
  const unit = term.duration_unit === 'year' ? '年' : '个月';
  return `${term.duration_value} ${unit}有效期`;
}

function productFacts(product: Product): string[] {
  const availability = product.purchasable
    ? '可创建服务端订单'
    : product.reason === 'lifetime_already_purchased'
      ? '该账户已购买此方案'
      : product.reason === 'provider_mapping_unavailable'
        ? '付款入口暂未配置'
        : product.reason === 'purchases_paused'
          ? '新购买暂时暂停，已有权益继续按原期限生效'
          : product.enabled
            ? '当前不可购买'
            : '当前未开放';
  return [termLabel(product.term), availability];
}

function hasCheckoutSnapshot(value: Record<string, unknown>): value is Record<
  string,
  unknown
> & {
  price: SubscriptionCheckoutDto['price'];
  currency: SubscriptionCheckoutDto['currency'];
  term: SubscriptionCheckoutDto['term'];
} {
  const term = value.term;
  return (
    isMoneyAmount(value.price) &&
    value.currency === 'CNY' &&
    typeof term === 'object' &&
    term !== null &&
    !Array.isArray(term) &&
    (term as Record<string, unknown>).kind === 'finite' &&
    typeof (term as Record<string, unknown>).duration_value === 'number' &&
    Number.isSafeInteger((term as Record<string, unknown>).duration_value) &&
    ((term as Record<string, unknown>).duration_unit === 'month' ||
      (term as Record<string, unknown>).duration_unit === 'year')
  );
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const csrf =
    typeof document === 'undefined'
      ? null
      : (document.cookie
          .split('; ')
          .find((entry) => entry.startsWith('aisenhub-consumer-csrf='))
          ?.slice('aisenhub-consumer-csrf='.length) ?? null);
  const response = await fetch(`/api/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string };
  } | null;
  if (!response.ok || !payload?.data)
    throw new Error(payload?.error?.code ?? 'AUTHORIZATION_UNAVAILABLE');
  return payload.data;
}

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Product[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState('');
  const [currentPlan, setCurrentPlan] = useState('free');
  const [currentPlanName, setCurrentPlanName] = useState('Free');
  const [feedback, setFeedback] = useState('当前使用免费版');
  const [workspaceStatus, setWorkspaceStatus] =
    useState<WorkspaceStatus>('unknown');
  const [isActivatingWorkspace, setIsActivatingWorkspace] = useState(false);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [pendingContributionPlan, setPendingContributionPlan] =
    useState<ContributionPlan | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(
    null,
  );
  const [pendingPaymentReady, setPendingPaymentReady] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState('');
  const [isRefreshingPayment, setIsRefreshingPayment] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [redemptionState, setRedemptionState] =
    useState<RedemptionState>('idle');
  const [redemptionMessage, setRedemptionMessage] = useState('');

  useEffect(() => {
    setPendingPayment(readPendingPayment());
    setPendingPaymentReady(true);
  }, []);

  useEffect(() => {
    if (!pendingPaymentReady) return;
    persistPendingPayment(pendingPayment);
  }, [pendingPayment, pendingPaymentReady]);

  const refreshSubscription = useCallback(async () => {
    const entitlement = await api<Entitlement>('v1/subscription');
    const planCode = entitlement.subscription_product?.code ?? 'free';
    const displayName =
      entitlement.subscription_product?.name ??
      entitlement.plan?.name ??
      'Free';
    setCurrentPlan(planCode);
    setCurrentPlanName(displayName);
    setWorkspaceStatus('active');
    setFeedback(
      entitlement.effective_status === 'active'
        ? `服务端已确认 · ${displayName}`
        : entitlement.effective_status === 'suspended'
          ? '账户已暂停，权益不再生效'
          : '当前使用免费版',
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const productsPromise = api<unknown>('v1/subscription/products')
        .then((products) => {
          if (cancelled) return;
          if (!isSubscriptionProductList(products))
            throw new Error('INVALID_SUBSCRIPTION_PRODUCT');
          setPlans(
            products.map((product) => {
              return {
                ...product,
                accent: accentFor(product.code),
                displayPrice: formatPrice(product.price, product.currency),
              };
            }),
          );
        })
        .catch(() => {
          if (cancelled) return;
          setPlansError('商品目录暂时不可用，请检查服务端配置后刷新。');
        })
        .finally(() => {
          if (!cancelled) setPlansLoading(false);
        });

      const entitlementPromise = refreshSubscription().catch(
        (error: unknown) => {
          if (cancelled) return;
          const code = errorCode(error);
          setWorkspaceStatus(
            code === 'UNAUTHORIZED'
              ? 'unauthorized'
              : code === 'ACCOUNT_NOT_ACTIVATED'
                ? 'not_activated'
                : 'unavailable',
          );
          setFeedback(
            code === 'UNAUTHORIZED'
              ? '登录后可激活工作区并创建付款订单'
              : code === 'ACCOUNT_NOT_ACTIVATED'
                ? '请先激活工作区，再创建付款订单'
                : '订阅状态暂时不可用，商品目录仍可查看',
          );
        },
      );
      await Promise.all([productsPromise, entitlementPromise]);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshSubscription]);

  const refreshPendingCheckout = useCallback(
    async (id: string) => {
      const checkout = await api<CheckoutStatus>(
        `v1/subscription/checkout/${id}`,
      );
      setPendingPayment((current) =>
        current
          ? {
              ...current,
              status: checkout.status,
              price: checkout.price,
              currency: checkout.currency,
              term: checkout.term,
            }
          : current,
      );
      if (checkout.status === 'granted') {
        setPaymentFeedback('支付已确认，权益已由服务端开通。');
        setPendingPayment(null);
        await refreshSubscription();
      } else if (
        checkout.status === 'review_required' ||
        checkout.status === 'resolved'
      ) {
        setPaymentFeedback('订单需要人工处理，请保留订单号并稍后查看。');
      } else if (checkout.status === 'paid') {
        setPaymentFeedback('已收到付款，正在等待服务端完成权益确认。');
      } else if (checkout.status === 'expired') {
        setPaymentFeedback('付款意图已过期，请重新创建订单。');
      } else {
        setPaymentFeedback('等待付款完成，页面会自动查询服务端状态。');
      }
      return checkout.status;
    },
    [refreshSubscription],
  );

  const checkoutId = pendingPayment?.checkoutId;
  useEffect(() => {
    if (!checkoutId) return;
    const activeCheckoutId = checkoutId;
    let cancelled = false;
    let attempts = 0;
    async function poll() {
      attempts += 1;
      try {
        const status = await refreshPendingCheckout(activeCheckoutId);
        if (cancelled) return;
        if (
          status === 'granted' ||
          status === 'review_required' ||
          status === 'resolved' ||
          status === 'expired'
        )
          clearInterval(timer);
      } catch {
        if (!cancelled)
          setPaymentFeedback('暂时无法读取订单状态，请稍后重试。');
      }
      if (attempts >= 30) {
        clearInterval(timer);
        if (!cancelled)
          setPaymentFeedback('自动查询已暂停，你仍可以手动刷新订单状态。');
      }
    }
    const timer = window.setInterval(() => void poll(), 4000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [checkoutId, refreshPendingCheckout]);

  async function createCheckout(
    name: string,
    code: SubscriptionCheckoutDto['product_code'],
  ) {
    if (code === currentPlan || pendingPayment || isCreatingCheckout) return;
    // Reserve a tab while the click still has transient user activation. The
    // checkout URL is created by the server asynchronously, so opening the
    // tab after await can be blocked as a popup by the browser.
    const paymentWindow =
      typeof window === 'undefined'
        ? null
        : window.open('about:blank', '_blank');
    // Do not pass `noopener` to window.open here: Chromium may return a null
    // handle while still creating the tab, leaving the blank tab unreachable.
    // The handle is needed to navigate after the async checkout request.
    if (paymentWindow) paymentWindow.opener = null;
    const idempotencyKey = crypto.randomUUID();
    setIsCreatingCheckout(true);
    setFeedback(`正在创建付款订单 · ${name}`);
    setPaymentFeedback('正在创建服务端定价订单…');
    try {
      const checkout = await api<SubscriptionCheckoutDto>(
        'v1/subscription/checkout',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ product_code: code }),
        },
      );
      const pending = {
        checkoutId: checkout.checkout_id,
        code: checkout.product_code,
        name,
        status: checkout.status,
        url: checkout.payment_url,
        price: checkout.price,
        currency: checkout.currency,
        term: checkout.term,
      } satisfies PendingPayment;
      // Persist before navigating so returning from the Provider restores the
      // server-side checkout snapshot and resumes status polling.
      persistPendingPayment(pending);
      setPendingPayment(pending);
      setFeedback(`等待支付 · ${name}`);
      setPaymentFeedback(
        checkout.payment_url
          ? '订单已创建，付款完成后页面会自动刷新状态。'
          : '订单已创建，当前 Provider 付款入口尚未配置。',
      );
      if (checkout.payment_url) {
        if (paymentWindow && !paymentWindow.closed) {
          paymentWindow.location.replace(checkout.payment_url);
          setPaymentFeedback(
            '订单已创建，已在新标签页打开付款页面；请保留当前页面，支付完成后这里会自动更新。',
          );
        } else {
          setPaymentFeedback(
            '订单已创建，但浏览器阻止了新标签页；请点击下方链接打开付款页面。',
          );
        }
      } else {
        paymentWindow?.close();
      }
    } catch (error) {
      paymentWindow?.close();
      const code = errorCode(error);
      if (code === 'UNAUTHORIZED') {
        setPaymentFeedback('请先登录账户，再创建付款订单。');
        setFeedback('请先登录账户，再创建付款订单。');
        window.location.assign('/login');
        return;
      }
      const message =
        code === 'ACCOUNT_NOT_ACTIVATED'
          ? '请先激活工作区，再创建付款订单。'
          : code === 'CHECKOUT_UNAVAILABLE'
            ? '当前套餐暂未开放付款，请稍后再试。'
            : '订单创建失败，请稍后重试。';
      setPaymentFeedback(message);
      setFeedback(message);
    } finally {
      setIsCreatingCheckout(false);
    }
  }

  function choosePlan(
    name: string,
    code: SubscriptionCheckoutDto['product_code'],
  ) {
    if (code === 'lifetime') {
      setPendingContributionPlan({ name, code });
      return;
    }
    void createCheckout(name, code);
  }

  function confirmContribution() {
    if (!pendingContributionPlan) return;
    const plan = pendingContributionPlan;
    setPendingContributionPlan(null);
    void createCheckout(plan.name, plan.code);
  }

  async function activateWorkspace() {
    if (isActivatingWorkspace) return;

    setIsActivatingWorkspace(true);
    setPaymentFeedback('正在激活当前平台工作区…');
    try {
      await api('v1/account/activate', { method: 'POST' });
      setWorkspaceStatus('active');
      setPaymentFeedback('工作区已激活，正在读取最新权益状态。');
      await refreshSubscription();
    } catch (error) {
      const code = errorCode(error);
      if (code === 'UNAUTHORIZED') {
        setPaymentFeedback('请先登录账户，再激活工作区。');
        window.location.assign('/login');
      } else {
        setPaymentFeedback(
          code === 'ACTIVATION_DISABLED'
            ? '当前平台暂未开放新工作区激活。'
            : '工作区激活失败，请稍后重试。',
        );
      }
    } finally {
      setIsActivatingWorkspace(false);
    }
  }

  async function confirmPayment() {
    const id = pendingPayment?.checkoutId;
    if (!id || isRefreshingPayment) return;
    setIsRefreshingPayment(true);
    setPaymentFeedback('正在刷新服务端订单状态…');
    try {
      await refreshPendingCheckout(id);
    } catch {
      setPaymentFeedback('暂时无法读取订单状态，请稍后重试。');
    } finally {
      setIsRefreshingPayment(false);
    }
  }

  function cancelPayment() {
    setPaymentFeedback('已关闭本地订单面板；服务端订单不会被伪造取消。');
    setPendingPayment(null);
  }

  function redeemActivationCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = activationCode.trim().toUpperCase();

    if (!activationCodePattern.test(normalizedCode)) {
      setRedemptionState('invalid');
      setRedemptionMessage('格式不正确，请输入16至128位激活码（可带短横线）。');
      return;
    }

    setActivationCode(normalizedCode);
    setRedemptionState('checking');
    setRedemptionMessage('格式正确，正在向后台验证激活码…');
    void api<Entitlement>('v1/subscription/redeem', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ code: normalizedCode }),
    })
      .then(async () => {
        setRedemptionState('idle');
        setRedemptionMessage('兑换成功，权益状态已由服务端更新。');
        await refreshSubscription();
      })
      .catch((error: unknown) => {
        setRedemptionState('error');
        setRedemptionMessage(
          error instanceof Error && error.message === 'CODE_EXPIRED'
            ? '激活码已过期，请联系管理员。'
            : '兑换失败，请检查激活码状态后重试。',
        );
      });
  }

  return (
    <ConsumerShell
      title="订阅方案"
      description="选择适合你的方案，获得更高效、稳定的配置管理体验。"
    >
      <section
        className="consumer-checkout-rules"
        aria-labelledby="checkout-rules-title"
        data-test="subscription-checkout-entry"
      >
        <div>
          <p className="consumer-overline">
            {process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging'
              ? 'STAGING 测试入口'
              : '模板付款入口'}
          </p>
          <h2 id="checkout-rules-title">从方案卡创建绑定订单</h2>
          <p>
            请从下方方案卡开始付款，不要直接修改或复制爱发电商品链接。系统会由服务端锁定价格、期限和订单绑定，再打开爱发电付款页。
          </p>
        </div>
        <ol className="consumer-checkout-rule-list">
          <li>价格与期限以服务端 Checkout 快照为准。</li>
          <li>付款结果只认服务端订单状态，不信任浏览器回调。</li>
          <li>支付密钥和平台密钥只留在服务端，不进入浏览器。</li>
        </ol>
      </section>

      <section className="consumer-current-plan" role="status">
        <span className="consumer-current-plan-icon">
          <Icon name="user" size={20} />
        </span>
        <span>
          <strong>当前方案：{currentPlanName}</strong>
          <small>{feedback}</small>
        </span>
        {workspaceStatus === 'not_activated' ? (
          <button
            className="consumer-button consumer-button-primary"
            type="button"
            disabled={isActivatingWorkspace}
            onClick={() => void activateWorkspace()}
            data-test="subscription-activate-account"
          >
            {isActivatingWorkspace ? '激活中…' : '激活工作区'}
          </button>
        ) : workspaceStatus === 'unauthorized' ? (
          <a
            className="consumer-button consumer-button-secondary"
            href="/login"
          >
            去登录
          </a>
        ) : null}
      </section>

      <div
        className={`consumer-plan-grid-wrap${pendingPayment ? ' is-payment-pending' : ''}`}
        aria-busy={Boolean(pendingPayment)}
      >
        <section
          className="consumer-plan-grid"
          aria-label="四种订阅方案"
          data-test="subscription-products"
        >
          {plansLoading || plansError ? (
            <div
              className="consumer-plan-empty"
              role="status"
              data-test="subscription-products-unavailable"
            >
              <strong>
                {plansLoading ? '正在读取订阅方案…' : '暂时无法读取订阅方案'}
              </strong>
              <span>
                {plansError || '价格、期限和购买状态将由服务端返回。'}
              </span>
            </div>
          ) : null}
          {!plansLoading && !plansError
            ? plans.map((plan) => {
                const isCurrent = plan.code === currentPlan;
                return (
                  <article
                    className={`consumer-subscription-card is-${plan.accent}${isCurrent ? ' is-current' : ''}`}
                    key={plan.code}
                  >
                    <div className="consumer-subscription-heading">
                      <span className="consumer-plan-icon">
                        <Icon
                          name={
                            plan.code === 'free'
                              ? 'user'
                              : plan.code === 'lifetime'
                                ? 'infinity'
                                : 'card'
                          }
                          size={22}
                        />
                      </span>
                      <div>
                        <h2>{plan.name}</h2>
                        <div className="consumer-subscription-price">
                          <strong>{plan.displayPrice}</strong>
                          <span>{termLabel(plan.term)}</span>
                        </div>
                      </div>
                      {isCurrent ? (
                        <span className="consumer-plan-label">当前使用中</span>
                      ) : null}
                      {plan.recommended ? (
                        <span className="consumer-plan-label is-recommended">
                          推荐
                        </span>
                      ) : null}
                    </div>
                    <p className="consumer-subscription-description">
                      {plan.description}
                    </p>
                    <ul className="consumer-plan-features">
                      {productFacts(plan).map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <button
                      className={`consumer-plan-button${isCurrent ? ' is-current' : ''}`}
                      type="button"
                      disabled={
                        isCurrent ||
                        Boolean(pendingPayment) ||
                        isCreatingCheckout ||
                        !plan.enabled ||
                        !plan.purchasable
                      }
                      onClick={() => {
                        if (plan.code !== 'free')
                          void choosePlan(plan.name, plan.code);
                      }}
                      data-test={`subscription-plan-${plan.code}`}
                    >
                      {isCreatingCheckout && !isCurrent
                        ? '创建中…'
                        : isCurrent
                          ? '当前使用中'
                          : !plan.enabled || !plan.purchasable
                            ? '暂未开放'
                            : '选择方案'}
                    </button>
                  </article>
                );
              })
            : null}
        </section>
        {pendingPayment ? (
          <div className="consumer-plan-lock" aria-hidden="true" />
        ) : null}
      </div>

      {pendingPayment ? (
        <section
          className="consumer-payment-pending"
          aria-labelledby="payment-pending-title"
        >
          <div className="consumer-payment-heading">
            <span className="consumer-payment-icon">
              <Icon name="card" size={20} />
            </span>
            <div>
              <p className="consumer-overline">支付状态</p>
              <h2 id="payment-pending-title">
                等待支付 · {pendingPayment.name}
              </h2>
            </div>
          </div>
          <p className="consumer-payment-description">
            {pendingPayment.price && pendingPayment.term ? (
              <strong>
                {formatPrice(
                  pendingPayment.price,
                  pendingPayment.currency ?? 'CNY',
                )}{' '}
                · {termLabel(pendingPayment.term)}
              </strong>
            ) : (
              <strong>正在读取服务端订单快照…</strong>
            )}
            <br />
            {pendingPayment.url
              ? '已在浏览器打开 Provider 付款页。支付完成后权益状态会由服务端自动确认。'
              : '订单已保存，但 Provider 付款入口尚未配置；请稍后刷新订单状态。'}
          </p>
          {paymentFeedback ? (
            <p className="consumer-payment-feedback" role="status">
              {paymentFeedback}
            </p>
          ) : null}
          <div className="consumer-payment-actions">
            <span className="consumer-payment-fallback">
              {pendingPayment.url ? (
                <>
                  没看到付款页？
                  <a
                    href={pendingPayment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    点此打开
                  </a>
                </>
              ) : null}
            </span>
            <div className="consumer-payment-buttons">
              <button
                className="consumer-button consumer-button-primary"
                type="button"
                disabled={isRefreshingPayment}
                onClick={() => void confirmPayment()}
              >
                {isRefreshingPayment ? '查询中…' : '刷新订单状态'}
              </button>
              <button
                className="consumer-button consumer-button-secondary"
                type="button"
                onClick={cancelPayment}
              >
                取消
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {paymentFeedback && !pendingPayment ? (
        <p className="consumer-payment-feedback is-after" role="status">
          {paymentFeedback}
        </p>
      ) : null}

      <section
        className="consumer-redemption-panel"
        aria-labelledby="redemption-title"
      >
        <div className="consumer-redemption-heading">
          <span className="consumer-redemption-icon">
            <Icon name="key" size={20} />
          </span>
          <div>
            <h2 id="redemption-title">激活码</h2>
          </div>
        </div>

        <form
          className="consumer-redemption-form"
          onSubmit={redeemActivationCode}
          aria-busy={redemptionState === 'checking'}
        >
          <label className="consumer-field" htmlFor="activation-code">
            <span>激活码</span>
            <div className="consumer-redemption-input-row">
              <input
                id="activation-code"
                value={activationCode}
                onChange={(event) =>
                  setActivationCode(event.target.value.toUpperCase())
                }
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                disabled={redemptionState === 'checking'}
                aria-describedby="activation-code-hint redemption-status"
              />
              <button
                className="consumer-button consumer-button-primary consumer-redemption-submit"
                type="submit"
                disabled={redemptionState === 'checking'}
              >
                {redemptionState === 'checking' ? '验证中…' : '立即兑换'}
              </button>
            </div>
            <small id="activation-code-hint">
              激活码格式为 4 组字符，例如 XXXX-XXXX-XXXX-XXXX。
            </small>
          </label>
          <p
            className={`consumer-redemption-status is-${redemptionState}`}
            id="redemption-status"
            role="status"
            aria-live="polite"
          >
            {redemptionMessage}
          </p>
        </form>
      </section>

      {pendingContributionPlan ? (
        <div
          className="consumer-modal-backdrop"
          data-test="lifetime-contribution-dialog"
        >
          <div
            className="consumer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lifetime-contribution-title"
            aria-describedby="lifetime-contribution-description"
          >
            <div className="consumer-modal-icon" aria-hidden="true">
              <Icon name="infinity" size={22} />
            </div>
            <h2 id="lifetime-contribution-title">确认购买 99 年商品？</h2>
            <p
              className="consumer-modal-description"
              id="lifetime-contribution-description"
            >
              该商品允许重复购买。成功付款会记录为对开发者的搭赏；如果账户已有同一商品的有效期，本次会在当前到期时间后再增加
              99 年。按当前网站规则，购买权益不提供退款。
            </p>
            <div className="consumer-modal-actions">
              <button
                className="consumer-button consumer-button-secondary"
                type="button"
                onClick={() => setPendingContributionPlan(null)}
              >
                返回选择
              </button>
              <button
                className="consumer-button consumer-button-primary"
                type="button"
                autoFocus
                onClick={confirmContribution}
              >
                确认并创建付款订单
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConsumerShell>
  );
}
