'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { ConsumerShell, Icon } from '../../components/consumer-shell';

const plans = [
  {
    code: 'free',
    name: '免费版',
    price: '¥0',
    unit: '/ 永久',
    description: '适合个人体验，满足基础配置管理需求。',
    features: ['基础功能使用', '有限的配置空间', '个人使用'],
    accent: 'sage',
    recommended: false,
  },
  {
    code: 'monthly',
    name: '月订阅',
    price: '¥9.9',
    unit: '/ 月',
    description: '灵活订阅，适合短期项目和阶段性使用。',
    features: ['解锁更多高级功能', '更大的配置空间', '优先技术支持'],
    accent: 'green',
    recommended: false,
  },
  {
    code: 'yearly',
    name: '年订阅',
    price: '¥19.9',
    unit: '/ 年',
    description: '适合长期使用，享受更完整的功能体验。',
    features: ['包含全部高级功能', '更大的配置空间', '优先技术支持'],
    accent: 'green',
    recommended: true,
  },
  {
    code: 'lifetime',
    name: '永久订阅',
    price: '¥29.9',
    unit: '/ 永久',
    description: '一次开通，长期使用，适合深度用户。',
    features: ['包含全部高级功能', '永久的配置空间', '长期技术支持'],
    accent: 'clay',
    recommended: false,
  },
] as const;

const activationCodePattern = /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/;
type RedemptionState = 'idle' | 'invalid' | 'checking' | 'error';

const afdianPaymentUrl =
  'https://www.afdian.com/order/create?product_type=1&plan_id=f1ca79cc99bb11f1a5055254001e7c00&sku=%5B%7B%22sku_id%22%3A%22f1d2427e99bb11f19e8f5254001e7c00%22%2C%22count%22%3A1%7D%5D&custom_order_id=O20260911868A24F263F7';

type PendingPayment = {
  code: string;
  name: string;
  url: string;
};

export default function SubscriptionPage() {
  const [currentPlan, setCurrentPlan] = useState('free');
  const [feedback, setFeedback] = useState('当前使用免费版');
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(
    null,
  );
  const [lifetimeNoticeOpen, setLifetimeNoticeOpen] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [redemptionState, setRedemptionState] =
    useState<RedemptionState>('idle');
  const [redemptionMessage, setRedemptionMessage] = useState('');

  useEffect(() => {
    if (!lifetimeNoticeOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setLifetimeNoticeOpen(false);
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [lifetimeNoticeOpen]);

  function choosePlan(name: string, code: string) {
    if (code === currentPlan || pendingPayment) return;

    if (code === 'lifetime') {
      setLifetimeNoticeOpen(true);
      return;
    }

    setPendingPayment({ code, name, url: afdianPaymentUrl });
    setPaymentFeedback('');
    setFeedback(`等待支付 · ${name}`);

    const paymentWindow = window.open(
      afdianPaymentUrl,
      '_blank',
      'noopener,noreferrer',
    );

    if (!paymentWindow) {
      setPaymentFeedback('浏览器拦截了新窗口，请点击下方“点此打开”。');
    }
  }

  function confirmPayment() {
    if (!pendingPayment) return;

    setPaymentFeedback(
      `已提交“${pendingPayment.name}”支付确认，等待后台回调到账。`,
    );
    setFeedback(`支付确认已提交，等待${pendingPayment.name}权益到账`);
    setPendingPayment(null);
  }

  function cancelPayment() {
    setPaymentFeedback('已取消本次支付，套餐选择已恢复。');
    setFeedback('当前使用免费版');
    setPendingPayment(null);
  }

  function goToActivationCode() {
    setLifetimeNoticeOpen(false);
    window.setTimeout(() => {
      document
        .getElementById('redemption-title')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('activation-code')?.focus();
    }, 0);
  }

  function redeemActivationCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = activationCode.trim().toUpperCase();

    if (!activationCodePattern.test(normalizedCode)) {
      setRedemptionState('invalid');
      setRedemptionMessage('格式不正确，请输入 XXXX-XXXX-XXXX-XXXX');
      return;
    }

    setActivationCode(normalizedCode);
    setRedemptionState('checking');
    setRedemptionMessage('格式正确，正在向后台验证激活码…');

    window.setTimeout(() => {
      setRedemptionState('error');
      setRedemptionMessage('当前为参考模式，后台兑换接口尚未连接。');
    }, 650);
  }

  return (
    <ConsumerShell
      title="订阅方案"
      description="选择适合你的方案，获得更高效、稳定的配置管理体验。"
    >
      <section className="consumer-current-plan" role="status">
        <span className="consumer-current-plan-icon">
          <Icon name="user" size={20} />
        </span>
        <span>
          <strong>
            当前方案：{plans.find((plan) => plan.code === currentPlan)?.name}
          </strong>
          <small>{feedback}</small>
        </span>
      </section>

      <div
        className={`consumer-plan-grid-wrap${pendingPayment ? ' is-payment-pending' : ''}`}
        aria-busy={Boolean(pendingPayment)}
      >
        <section className="consumer-plan-grid" aria-label="四种订阅方案">
          {plans.map((plan) => {
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
                      <strong>{plan.price}</strong>
                      <span>{plan.unit}</span>
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
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <button
                  className={`consumer-plan-button${isCurrent ? ' is-current' : ''}`}
                  type="button"
                  disabled={isCurrent || Boolean(pendingPayment)}
                  onClick={() => choosePlan(plan.name, plan.code)}
                >
                  {isCurrent ? '当前使用中' : '选择方案'}
                </button>
              </article>
            );
          })}
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
            已在浏览器打开爱发电付款页（支持微信 /
            支付宝）。支付完成后积分自动到账，无需停留在本页面。
          </p>
          {paymentFeedback ? (
            <p className="consumer-payment-feedback" role="status">
              {paymentFeedback}
            </p>
          ) : null}
          <div className="consumer-payment-actions">
            <span className="consumer-payment-fallback">
              没看到付款页？
              <a href={pendingPayment.url} target="_blank" rel="noreferrer">
                点此打开
              </a>
            </span>
            <div className="consumer-payment-buttons">
              <button
                className="consumer-button consumer-button-primary"
                type="button"
                onClick={confirmPayment}
              >
                我已完成支付
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

      {lifetimeNoticeOpen ? (
        <div
          className="consumer-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setLifetimeNoticeOpen(false);
            }
          }}
        >
          <section
            className="consumer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lifetime-notice-title"
          >
            <button
              className="consumer-modal-close"
              type="button"
              aria-label="关闭提示"
              onClick={() => setLifetimeNoticeOpen(false)}
            >
              ×
            </button>
            <span className="consumer-modal-icon">
              <Icon name="infinity" size={22} />
            </span>
            <p className="consumer-overline">永久订阅</p>
            <h2 id="lifetime-notice-title">请联系管理员开通</h2>
            <p className="consumer-modal-description">
              永久订阅暂不支持爱发电自动付款，请联系管理员获取对应的永久订阅激活码。
            </p>
            <div className="consumer-modal-actions">
              <button
                className="consumer-button consumer-button-primary"
                type="button"
                onClick={goToActivationCode}
              >
                去兑换激活码
              </button>
              <button
                className="consumer-button consumer-button-secondary"
                type="button"
                onClick={() => setLifetimeNoticeOpen(false)}
              >
                我知道了
              </button>
            </div>
          </section>
        </div>
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
    </ConsumerShell>
  );
}
