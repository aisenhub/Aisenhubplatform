'use client';

import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';

import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import { adminAuthSession } from '../../app/_lib/auth-session';
import {
  caughtResourceError,
  readApiPayload,
  resourceError,
  resourcePath,
  type ResourceError,
} from '../resources/admin-resource-utils';

type Plan = {
  plan_id: string;
  code: string;
  name: string;
  kind: 'free' | 'paid';
  status: 'active' | 'archived';
};

type SubscriptionConfig = {
  platform_id: string;
  paid_plan_id: string | null;
  paid_plan_code: string | null;
  paid_plan_name: string | null;
  paid_plan_status: 'active' | 'archived' | null;
  monthly_enabled: boolean;
  yearly_enabled: boolean;
  lifetime_enabled: boolean;
  subscription_copy_override: string | null;
  row_version: number;
  preflight_blocked_reason:
    | 'active_or_future_grant'
    | 'redeemable_old_plan_batch'
    | null;
  preflight_blocking_count: number;
};

type Props = { platformId: string; platformStatus: string };

export function SubscriptionConfigPanel({ platformId, platformStatus }: Props) {
  const [config, setConfig] = useState<SubscriptionConfig | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [message, setMessage] = useState<ResourceError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    setUnknownOutcome(false);
    try {
      const [configResponse, plansResponse] = await Promise.all([
        adminAuthSession.request(
          resourcePath(platformId, '/subscription-config'),
          { cache: 'no-store' },
        ),
        adminAuthSession.request(resourcePath(platformId, '/plans'), {
          cache: 'no-store',
        }),
      ]);
      const configPayload = await readApiPayload<SubscriptionConfig>(
        configResponse,
      );
      const plansPayload = await readApiPayload<Plan[]>(plansResponse);
      if (!configResponse.ok) {
        setConfig(null);
        setMessage(
          resourceError(configResponse, configPayload, '订阅配置'),
        );
        return;
      }
      if (!plansResponse.ok) {
        setConfig(configPayload?.data ?? null);
        setMessage(resourceError(plansResponse, plansPayload, 'Plan 列表'));
        return;
      }
      setConfig(configPayload?.data ?? null);
      setPlans(Array.isArray(plansPayload?.data) ? plansPayload.data : []);
      if (!configPayload?.data) {
        setMessage(caughtResourceError('订阅配置', '服务端返回了空配置。'));
      }
    } catch {
      setConfig(null);
      setMessage(caughtResourceError('订阅配置'));
    } finally {
      setLoading(false);
    }
  }, [platformId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!config || saving) return;
    setSaving(true);
    setMessage(null);
    setNeedsMfa(false);
    setUnknownOutcome(false);
    const epoch = adminAuthSession.getEpoch();
    try {
      const response = await adminAuthSession.request(
        resourcePath(platformId, '/subscription-config'),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"${config.row_version}"`,
          },
          body: JSON.stringify({
            paid_plan_id: config.paid_plan_id,
            monthly_enabled: config.monthly_enabled,
            yearly_enabled: config.yearly_enabled,
            lifetime_enabled: config.lifetime_enabled,
            subscription_copy_override: config.subscription_copy_override,
            reason: 'Admin 更新订阅商品配置',
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<SubscriptionConfig>(response);
      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      if (!response.ok) {
        if (
          response.status === 403 &&
          (payload?.error?.code === 'MFA_REQUIRED' ||
            payload?.error?.code === 'RECENT_MFA_REQUIRED')
        ) {
          setNeedsMfa(true);
        }
        setMessage(
          resourceError(response, payload, '订阅配置更新'),
        );
        return;
      }
      await load();
      setMessage({
        title: '订阅配置已保存',
        description: '页面已重新读取服务端配置，当前版本号以服务端返回为准。',
        requestId: response.headers.get('x-request-id'),
        technicalDetail: null,
      });
    } catch {
      setUnknownOutcome(true);
      setMessage({
        title: '订阅配置结果待确认',
        description:
          '网络在服务端响应前中断。请先重新读取并核对版本号，不要立即重复提交。',
        requestId: null,
        technicalDetail: 'UNKNOWN_OUTCOME',
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="panel" data-test="subscription-config-loading">
        <p className="text-sm text-muted-foreground">正在读取订阅商品配置…</p>
      </section>
    );
  }

  return (
    <section className="panel gap-4" data-test="subscription-config-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Subscription catalog
          </p>
          <h2 className="mt-2">订阅商品配置</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            商品目录固定为 Free、Monthly、Yearly、Lifetime。Lifetime 是有限的 99 年权益；当前没有渠道映射时，商品仍会明确显示不可购买。
          </p>
        </div>
        {config ? (
          <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
            row_version {config.row_version}
          </span>
        ) : null}
      </div>

      {message ? (
        <Alert
          variant={message.title.includes('已保存') ? undefined : 'destructive'}
          data-test="subscription-config-message"
        >
          <AlertTitle>{message.title}</AlertTitle>
          <AlertDescription>{message.description}</AlertDescription>
        </Alert>
      ) : null}

      {config ? (
        <>
          {platformStatus !== 'active' ? (
            <Alert>
              <AlertTitle>平台已停用</AlertTitle>
              <AlertDescription>
                服务端会拒绝普通用户商品访问；本页仍保留 Admin 配置读取能力。
              </AlertDescription>
            </Alert>
          ) : null}
          {config.preflight_blocked_reason ? (
            <Alert variant="destructive">
              <AlertTitle>当前映射存在切换阻塞</AlertTitle>
              <AlertDescription>
                {config.preflight_blocked_reason === 'active_or_future_grant'
                  ? '存在当前或未来生效的旧 Plan 权益，不能静默重映射。'
                  : '存在仍可兑换的旧 Plan 批次，不能静默重映射。'}{' '}
                阻塞数量：{config.preflight_blocking_count}。
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="paid-plan">标准付费 Plan</Label>
              <select
                id="paid-plan"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={config.paid_plan_id ?? ''}
                onChange={(event) =>
                  setConfig((current) =>
                    current
                      ? {
                          ...current,
                          paid_plan_id: event.target.value || null,
                          paid_plan_code:
                            plans.find(
                              (plan) => plan.plan_id === event.target.value,
                            )?.code ?? null,
                          paid_plan_name:
                            plans.find(
                              (plan) => plan.plan_id === event.target.value,
                            )?.name ?? null,
                        }
                      : current,
                  )
                }
              >
                <option value="">未配置（付费商品关闭）</option>
                {config.paid_plan_id &&
                config.paid_plan_status === 'archived' &&
                !plans.some((plan) => plan.plan_id === config.paid_plan_id) ? (
                  <option value={config.paid_plan_id}>
                    {config.paid_plan_code ?? '已归档 Plan'}（已归档）
                  </option>
                ) : null}
                {plans
                  .filter((plan) => plan.kind === 'paid')
                  .map((plan) => (
                    <option
                      key={plan.plan_id}
                      value={plan.plan_id}
                      disabled={plan.status !== 'active'}
                    >
                      {plan.name}（{plan.code}）{plan.status === 'archived' ? '（已归档）' : ''}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                只能选择当前平台的 active paid Plan；切换会执行权益和旧批次前置检查。
              </p>
            </div>
            <Toggle
              label="Monthly"
              checked={config.monthly_enabled}
              onChange={(checked) =>
                setConfig((current) =>
                  current ? { ...current, monthly_enabled: checked } : current,
                )
              }
            />
            <Toggle
              label="Yearly"
              checked={config.yearly_enabled}
              onChange={(checked) =>
                setConfig((current) =>
                  current ? { ...current, yearly_enabled: checked } : current,
                )
              }
            />
            <Toggle
              label="Lifetime（99 年）"
              checked={config.lifetime_enabled}
              onChange={(checked) =>
                setConfig((current) =>
                  current ? { ...current, lifetime_enabled: checked } : current,
                )
              }
            />
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="subscription-copy">订阅页文案覆盖（可选）</Label>
              <Textarea
                id="subscription-copy"
                maxLength={1024}
                value={config.subscription_copy_override ?? ''}
                onChange={(event) =>
                  setConfig((current) =>
                    current
                      ? {
                          ...current,
                          subscription_copy_override: event.target.value || null,
                        }
                      : current,
                  )
                }
                placeholder="留空使用产品默认文案"
              />
            </div>
          </div>
          {needsMfa ? (
            <AdminRecentMfaPanel
              onVerified={() => {
                setNeedsMfa(false);
                setMessage({
                  title: '近期 MFA 已验证',
                  description: '请再次点击“保存订阅配置”提交刚才的修改。',
                  requestId: null,
                  technicalDetail: null,
                });
              }}
            />
          ) : null}
          {unknownOutcome ? (
            <Button variant="outline" onClick={() => void load()}>
              重新读取配置
            </Button>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} disabled={saving || needsMfa}>
              {saving ? '保存中…' : '保存订阅配置'}
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={saving}>
              重新读取
            </Button>
            <span className="text-xs text-muted-foreground">
              保存需要近期 MFA；并发修改会由 If-Match 阻止。
            </span>
          </div>
        </>
      ) : (
        <Button variant="outline" onClick={() => void load()}>
          重新读取订阅配置
        </Button>
      )}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
      <Input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
      <span>{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {checked ? '已启用' : '已关闭'}
      </span>
    </label>
  );
}
