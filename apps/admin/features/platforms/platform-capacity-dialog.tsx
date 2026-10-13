'use client';

import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { SupportErrorId } from '@kit/ui/support-error-id';

import { SessionRetryRequiredError } from '../../app/_lib/auth/browser';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import type { Platform } from '../../components/platform-context/platform-types';
import {
  isRecentMfaRequired,
  readApiPayload,
  resourceError,
  type ResourceError,
} from '../resources/admin-resource-utils';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';

const MIB = 1024 * 1024;
const MAX_CAPACITY_MIB = 1024 * 1024;

type PlatformStoragePolicy = {
  platform_id: string;
  enabled: boolean;
  max_file_bytes: number;
  max_platform_total_bytes: number;
  platform_reserved_bytes: number;
  platform_actual_bytes: number;
  platform_available_bytes: number;
  platform_over_capacity: boolean;
  updated_at?: string | null;
};

function formatBytes(value: number): string {
  if (value < MIB) return `${value} B`;
  if (value < 1024 * MIB) return `${(value / MIB).toFixed(1)} MiB`;
  return `${(value / (1024 * MIB)).toFixed(2)} GiB`;
}

export function PlatformCapacityDialog({ platform }: { platform: Platform }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<PlatformStoragePolicy | null>(null);
  const [capacityMiB, setCapacityMiB] = useState('1024');
  const [error, setError] = useState<ResourceError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );

  const endpoint = `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platform.platform_id)}/file-policy`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminAuthSession.request(endpoint, {
        cache: 'no-store',
      });
      const payload = await readApiPayload<PlatformStoragePolicy>(response);
      if (!response.ok || !payload?.data) {
        setError(resourceError(response, payload, '平台存储容量'));
        return;
      }
      setPolicy(payload.data);
      setCapacityMiB(
        String(
          Math.max(1, Math.round(payload.data.max_platform_total_bytes / MIB)),
        ),
      );
    } catch (caught) {
      setError({
        title: '平台存储容量读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  function prepareSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(capacityMiB);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CAPACITY_MIB) {
      setError({
        title: '平台总容量不正确',
        description: '请输入 1–1,048,576 MiB 的整数（最大 1 TiB）。',
        requestId: null,
        technicalDetail: 'INVALID_INPUT',
      });
      return;
    }
    setMutationState('confirm_required');
    setMutationError(null);
    setConfirmOpen(true);
  }

  async function save() {
    if (!policy) return;
    const bytes = Number(capacityMiB) * MIB;
    setMutationState('pending');
    setMutationError(null);
    try {
      const response = await adminAuthSession.request(
        endpoint,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: policy.enabled,
            max_file_bytes: policy.max_file_bytes,
            max_platform_total_bytes: bytes,
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<PlatformStoragePolicy>(response);
      if (!response.ok || !payload?.data) {
        if (isRecentMfaRequired(response, payload)) {
          setMutationState('step_up_required');
          return;
        }
        setMutationState('failure');
        setMutationError(resourceError(response, payload, '平台存储容量'));
        return;
      }
      setPolicy(payload.data);
      setCapacityMiB(
        String(
          Math.max(1, Math.round(payload.data.max_platform_total_bytes / MIB)),
        ),
      );
      setMutationState('success');
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新确认',
          description:
            '为避免重复修改容量，本次请求没有自动重放。请先重新读取当前容量。',
          requestId: null,
          technicalDetail: 'SESSION_RECOVERY_REQUIRED',
        });
        return;
      }
      setMutationState('unknown_outcome');
      setMutationError({
        title: '容量修改结果待确认',
        description: '响应前连接中断。请先重新读取平台容量，不要立即重复提交。',
        requestId: null,
        technicalDetail: 'UNKNOWN_OUTCOME',
      });
    }
  }

  async function checkUnknown() {
    await load();
    setMutationState('failure');
    setMutationError({
      title: '已刷新权威容量',
      description: '请根据最新平台容量判断原请求是否生效；页面不会自动重发。',
      requestId: null,
      technicalDetail: 'STATE_RELOADED',
    });
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) void load();
          else if (mutationState !== 'pending') {
            setError(null);
            setConfirmOpen(false);
          }
        }}
      >
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              data-test="platform-capacity-open"
            />
          }
        >
          存储容量
        </DialogTrigger>
        <DialogContent data-test="platform-capacity-dialog">
          <DialogHeader>
            <DialogTitle>{platform.name} · 平台总存储容量</DialogTitle>
            <DialogDescription>
              这是 Global 治理额度，覆盖 legacy 与 Config Version
              的全部物理预约。降低到当前使用量以下不会删除数据，只会让新预约失败。
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p className="text-sm text-muted-foreground">正在读取权威容量…</p>
          ) : null}
          {error ? (
            <Alert variant="destructive" data-test="platform-capacity-error">
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>
                {error.description}
                <SupportErrorId
                  requestId={error.requestId}
                  technicalDetail={error.technicalDetail}
                />
              </AlertDescription>
            </Alert>
          ) : null}
          {policy ? (
            <form className="grid gap-4" onSubmit={prepareSave}>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                <CapacityFact
                  label="当前上限"
                  value={formatBytes(policy.max_platform_total_bytes)}
                />
                <CapacityFact
                  label="已预约"
                  value={formatBytes(policy.platform_reserved_bytes)}
                />
                <CapacityFact
                  label="实际占用"
                  value={formatBytes(policy.platform_actual_bytes)}
                />
                <CapacityFact
                  label="剩余可预约"
                  value={formatBytes(policy.platform_available_bytes)}
                />
              </div>
              {policy.platform_over_capacity ? (
                <Alert data-test="platform-capacity-over">
                  <AlertTitle>当前已超出容量</AlertTitle>
                  <AlertDescription>
                    现有数据不会被自动删除；服务端会继续阻止新的物理预约。
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor={`platform-capacity-${platform.platform_id}`}>
                  新平台总容量（MiB）
                </Label>
                <Input
                  id={`platform-capacity-${platform.platform_id}`}
                  type="number"
                  min={1}
                  max={MAX_CAPACITY_MIB}
                  step={1}
                  value={capacityMiB}
                  onChange={(event) => setCapacityMiB(event.target.value)}
                  data-test="platform-capacity-input"
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={loading}
                  data-test="platform-capacity-save"
                >
                  保存容量
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {confirmOpen && policy ? (
        <ConfirmActionDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen && mutationState !== 'pending') {
              setConfirmOpen(false);
              setMutationState('confirm_required');
              setMutationError(null);
            }
          }}
          title="确认修改平台总存储容量"
          targetIdentity={`${platform.name} (${platform.code})`}
          impact={`平台总容量将改为 ${capacityMiB} MiB。若低于当前已预约量，只会进入超额状态并阻止新预约，不会自动删除已有对象。`}
          reversible
          state={mutationState}
          error={mutationError}
          stepUpContent={
            mutationState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => setMutationState('confirm_required')}
              />
            ) : null
          }
          onCheckUnknown={
            mutationState === 'unknown_outcome'
              ? () => void checkUnknown()
              : undefined
          }
          onConfirm={() => void save()}
        />
      ) : null}
    </>
  );
}

function CapacityFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}
