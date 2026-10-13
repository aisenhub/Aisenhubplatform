'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import {
  readApiPayload,
  resourceError,
  resourcePath,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';
import { ConfigResourceCenter } from './config-resource-center';

type Policy = {
  enabled: boolean;
  max_file_bytes: number;
  max_files: number;
  max_total_bytes: number;
  max_platform_total_bytes?: number;
  platform_reserved_bytes?: number;
  platform_actual_bytes?: number;
  platform_available_bytes?: number;
  platform_over_capacity?: boolean;
};

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

export function PlatformFilesPage() {
  const { platform } = usePlatformContext();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyState, setPolicyState] = useState<ResourceLoadState>('loading');
  const [policyError, setPolicyError] = useState<ResourceError | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<ResourceError | null>(null);

  const loadPolicy = useCallback(async () => {
    const epoch = adminAuthSession.getEpoch();
    setPolicyState('loading');
    setPolicyError(null);
    try {
      const response = await adminAuthSession.request(
        resourcePath(platform.platform_id, '/file-policy'),
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<Policy>(response);
      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      if (!response.ok || !payload?.data) {
        setPolicyError(resourceError(response, payload, 'Storage 策略'));
        setPolicyState('error');
        return;
      }
      setPolicy(payload.data);
      setPolicyState('success');
    } catch (caught) {
      if (!adminAuthSession.isCurrentEpoch(epoch)) return;
      setPolicyError({
        title: 'Storage 策略读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
      setPolicyState('error');
    }
  }, [platform.platform_id]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await adminAuthSession.request(
        resourcePath(platform.platform_id, '/file-policy'),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: policy.enabled,
            max_file_bytes: policy.max_file_bytes,
            max_files: policy.max_files,
            max_total_bytes: policy.max_total_bytes,
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Policy>(response);
      if (!response.ok || !payload?.data) {
        setMessage(resourceError(response, payload, 'Storage 策略保存'));
        return;
      }
      setPolicy(payload.data);
      setMessage({
        title: 'Storage 策略已保存',
        description: '服务端已返回最新策略事实。',
        requestId: response.headers.get('x-request-id'),
        technicalDetail: null,
      });
    } catch (caught) {
      setMessage({
        title: 'Storage 策略结果待确认',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: 'UNKNOWN_OUTCOME',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-5" data-test="platform-files-page">
      <AdminPageHeader
        title="配置资源"
        description="Config、不可变 Version、Gallery 审核与平台 Storage 容量使用同一业务入口；generic 文件产品面已退出。"
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadPolicy()}>
            刷新容量
          </Button>
        }
      />

      <ConfigResourceCenter />

      <section className="panel gap-4" data-test="platform-file-policy">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>Storage Policy</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              这里只治理 Config Version 共用的物理 Storage 边界；对象状态由
              Config/Version 工作区展示。
            </p>
          </div>
          {policy ? (
            <StatusBadge
              label={policy.enabled ? '已启用' : '已停用'}
              tone={policy.enabled ? 'success' : 'danger'}
              rawValue={policy.enabled ? 'enabled' : 'disabled'}
            />
          ) : null}
        </div>

        {policyState === 'loading' ? <AsyncState state="loading" /> : null}
        {policyError && policyState === 'error' ? (
          <AsyncState
            state="error"
            title={policyError.title}
            description={policyError.description}
            requestId={policyError.requestId}
            technicalDetail={policyError.technicalDetail}
            onRetry={() => void loadPolicy()}
          />
        ) : null}

        {message ? (
          <Alert variant={message.technicalDetail ? 'destructive' : undefined}>
            <AlertTitle>{message.title}</AlertTitle>
            <AlertDescription>
              {message.description}
              <SupportErrorId
                requestId={message.requestId}
                technicalDetail={message.technicalDetail}
              />
            </AlertDescription>
          </Alert>
        ) : null}

        {policy ? (
          <form className="grid gap-4" onSubmit={savePolicy}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Fact
                label="平台总容量"
                value={formatBytes(policy.max_platform_total_bytes)}
              />
              <Fact
                label="已预约"
                value={formatBytes(policy.platform_reserved_bytes)}
              />
              <Fact
                label="实际字节"
                value={formatBytes(policy.platform_actual_bytes)}
              />
            </div>
            {policy.platform_over_capacity ? (
              <Alert variant="destructive">
                <AlertTitle>平台已超出容量</AlertTitle>
                <AlertDescription>
                  新 Version 预约会由服务端拒绝；现有对象不会被自动删除。
                </AlertDescription>
              </Alert>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policy.enabled}
                onChange={(event) =>
                  setPolicy({ ...policy, enabled: event.target.checked })
                }
                disabled={saving}
                data-test="platform-file-policy-enabled"
              />
              允许新的 Config Version Storage 写入
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <PolicyNumber
                id="file-policy-max-bytes"
                label="单对象上限（字节）"
                value={policy.max_file_bytes}
                onChange={(value) =>
                  setPolicy({ ...policy, max_file_bytes: value })
                }
                disabled={saving}
              />
              <PolicyNumber
                id="file-policy-max-files"
                label="账户对象上限"
                value={policy.max_files}
                onChange={(value) => setPolicy({ ...policy, max_files: value })}
                disabled={saving}
              />
              <PolicyNumber
                id="file-policy-max-total"
                label="账户字节上限"
                value={policy.max_total_bytes}
                onChange={(value) =>
                  setPolicy({ ...policy, max_total_bytes: value })
                }
                disabled={saving}
              />
            </div>
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? '保存中…' : '保存 Storage Policy'}
              </Button>
            </div>
          </form>
        ) : null}
      </section>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function PolicyNumber({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
      />
    </div>
  );
}
