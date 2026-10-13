'use client';

import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';

import { adminAuthSession } from '../../app/_lib/auth-session';
import {
  caughtResourceError,
  readApiPayload,
  resourceError,
  resourcePath,
  type ResourceError,
} from '../resources/admin-resource-utils';

type CommercePolicy = {
  platform_id: string;
  purchases_paused: boolean;
  subscription_copy_override: string | null;
  row_version: number;
};

type Props = { platformId: string; platformStatus: string };

export function SubscriptionConfigPanel({ platformId, platformStatus }: Props) {
  const [config, setConfig] = useState<CommercePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [message, setMessage] = useState<ResourceError | null>(null);

  const load = useCallback(
    async (preserveMessage = false) => {
      setLoading(true);
      if (!preserveMessage) setMessage(null);
      setUnknownOutcome(false);
      try {
        const configResponse = await adminAuthSession.request(
          resourcePath(platformId, '/commerce/policy'),
          { cache: 'no-store' },
        );
        const configPayload =
          await readApiPayload<CommercePolicy>(configResponse);
        if (!configResponse.ok) {
          setConfig(null);
          setMessage(resourceError(configResponse, configPayload, '商业策略'));
          return;
        }
        setConfig(configPayload?.data ?? null);
        if (!configPayload?.data) {
          setMessage(caughtResourceError('商业策略', '服务端返回了空策略。'));
        }
      } catch {
        setConfig(null);
        setMessage(caughtResourceError('商业策略'));
      } finally {
        setLoading(false);
      }
    },
    [platformId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!config || saving) return;
    setSaving(true);
    setMessage(null);
    setUnknownOutcome(false);
    const epoch = adminAuthSession.getEpoch();
    try {
      const response = await adminAuthSession.request(
        resourcePath(platformId, '/commerce/policy'),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"${config.row_version}"`,
          },
          body: JSON.stringify({
            purchases_paused: config.purchases_paused,
            subscription_copy_override: config.subscription_copy_override,
            reason: 'Admin 更新 Commerce policy',
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<CommercePolicy>(response);
      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      if (!response.ok) {
        setMessage(resourceError(response, payload, '商业策略更新'));
        return;
      }
      if (payload?.data) setConfig(payload.data);
      setSaving(false);
      setMessage({
        title: '商业策略已保存',
        description: '购买开关和展示文案已保存；页面正在后台刷新最新策略。',
        requestId: response.headers.get('x-request-id'),
        technicalDetail: null,
      });
      void load(true);
    } catch {
      setUnknownOutcome(true);
      setMessage({
        title: '商业策略结果待确认',
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
        <p className="text-sm text-muted-foreground">
          正在读取 Commerce policy…
        </p>
      </section>
    );
  }

  return (
    <section className="panel gap-4" data-test="subscription-config-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Commerce policy
          </p>
          <h2 className="mt-2">商业购买策略</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Offer / Price / Provider Mapping
            决定真实销售目录；这里仅控制是否暂停新购买，
            以及订阅页展示文案，不再维护第二套 fixed-product 开关。
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
          {config.purchases_paused ? (
            <Alert>
              <AlertTitle>新购买已暂停</AlertTitle>
              <AlertDescription>
                新的付费 Checkout
                会立即被拒绝；已经成功购买的有限期权益仍按原结束时间继续生效。
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Toggle
              label="暂停新购买"
              checked={config.purchases_paused}
              onChange={(checked) =>
                setConfig((current) =>
                  current ? { ...current, purchases_paused: checked } : current,
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
                          subscription_copy_override:
                            event.target.value || null,
                        }
                      : current,
                  )
                }
                placeholder="留空使用产品默认文案"
              />
            </div>
          </div>
          {unknownOutcome ? (
            <Button variant="outline" onClick={() => void load()}>
              重新读取配置
            </Button>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '保存商业策略'}
            </Button>
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={saving}
            >
              重新读取
            </Button>
            <span className="text-xs text-muted-foreground">
              当前操作要求 AAL2；并发修改会由 If-Match 阻止。
            </span>
          </div>
        </>
      ) : (
        <Button variant="outline" onClick={() => void load()}>
          重新读取商业策略
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
