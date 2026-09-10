'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import type { MutationState } from '@kit/ui/mutation-state';
import { OneTimeSecretPanel } from '@kit/ui/one-time-secret-panel';
import { ResourceId } from '@kit/ui/resource-id';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  formatUtc,
  readApiPayload,
  resourceError,
  resourcePath,
  statusLabel,
  statusTone,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';

type Plan = {
  plan_id: string;
  code: string;
  name: string;
  kind: 'free' | 'paid';
  status: 'active' | 'archived';
};

type Batch = {
  batch_id: string;
  plan_id: string;
  plan_code: string;
  name: string;
  quantity: number;
  status: string;
  expires_at: string;
  delivery_deadline: string;
  delivered_at: string | null;
  created_at: string;
};

type CreateBatchPayload = {
  platform_id: string;
  plan_id: string;
  name: string;
  quantity: number;
  duration_value: number;
  duration_unit: 'day' | 'month' | 'year';
  expires_at: string;
  delivery_deadline: string;
  creation_operation_id: string;
};

type Delivery = {
  batchId: string;
  receipt: string;
  codes: string[];
};

type BatchIntent =
  | {
      kind: 'create';
      payload: CreateBatchPayload;
      targetId: string;
      title: string;
      impact: string;
    }
  | {
      kind: 'confirm-delivery';
      batchId: string;
      targetId: string;
      title: string;
      impact: string;
    }
  | {
      kind: 'disable';
      batchId: string;
      targetId: string;
      title: string;
      impact: string;
    };

function localDateTime(daysFromNow: number): string {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PlatformRedemptionBatchesPage() {
  const { platform } = usePlatformContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [filter, setFilter] = useState('');
  const [planId, setPlanId] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [durationValue, setDurationValue] = useState('30');
  const [durationUnit, setDurationUnit] = useState<'day' | 'month' | 'year'>(
    'day',
  );
  const [expiresAt, setExpiresAt] = useState(() => localDateTime(30));
  const [deliveryDeadline, setDeliveryDeadline] = useState(() =>
    localDateTime(1 / 24),
  );
  const [notice, setNotice] = useState<ResourceError | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [intent, setIntent] = useState<BatchIntent | null>(null);
  const [mutationState, setMutationState] =
    useState<MutationState>('confirm_required');
  const [mutationError, setMutationError] = useState<ResourceError | null>(
    null,
  );

  const load = useCallback(
    async (background = false) => {
      setRefreshError(null);
      setRefreshing(background);
      if (!background) {
        setState('loading');
        setError(null);
      }
      try {
        const [plansResponse, batchesResponse] = await Promise.all([
          adminAuthSession.request(
            resourcePath(platform.platform_id, '/plans'),
            { cache: 'no-store' },
          ),
          adminAuthSession.request(
            `/api/v1/admin/api/v1/redemption-batches?platform_id=${encodeURIComponent(platform.platform_id)}&limit=100`,
            { cache: 'no-store' },
          ),
        ]);
        const plansPayload = await readApiPayload<Plan[]>(plansResponse);
        const batchesPayload = await readApiPayload<Batch[]>(batchesResponse);
        if (!plansResponse.ok || !Array.isArray(plansPayload?.data)) {
          const nextError = resourceError(
            plansResponse,
            plansPayload,
            'Plan 列表',
          );
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        if (!batchesResponse.ok || !Array.isArray(batchesPayload?.data)) {
          const nextError = resourceError(
            batchesResponse,
            batchesPayload,
            '兑换批次列表',
          );
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        setPlans(plansPayload.data);
        setBatches(batchesPayload.data);
        setPlanId(
          (current) =>
            current ||
            plansPayload.data?.find(
              (plan) => plan.kind === 'paid' && plan.status === 'active',
            )?.plan_id ||
            '',
        );
        setState('success');
      } catch (caught) {
        const nextError: ResourceError = {
          title: '兑换批次读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        };
        if (background) setRefreshError(nextError);
        else {
          setError(nextError);
          setState('error');
        }
      } finally {
        setRefreshing(false);
      }
    },
    [platform.platform_id],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const visibleBatches = batches.filter((batch) =>
    `${batch.name} ${batch.plan_code} ${batch.status}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );

  function openCreateReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    const quantityValue = Number(quantity);
    const duration = Number(durationValue);
    const activePlan = plans.find(
      (plan) =>
        plan.plan_id === planId &&
        plan.status === 'active' &&
        plan.kind === 'paid',
    );
    const expires = new Date(expiresAt);
    const deadline = new Date(deliveryDeadline);
    if (!activePlan) {
      setNotice({
        title: '请选择 active paid Plan',
        description: '兑换码批次不能绑定 Free 或已归档 Plan。',
        requestId: null,
        technicalDetail: 'INVALID_INPUT',
      });
      return;
    }
    if (
      !normalizedName ||
      !Number.isInteger(quantityValue) ||
      quantityValue < 1 ||
      quantityValue > 1000 ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      Number.isNaN(expires.getTime()) ||
      Number.isNaN(deadline.getTime()) ||
      expires <= new Date() ||
      deadline <= new Date()
    ) {
      setNotice({
        title: '批次字段需要修正',
        description:
          '名称、数量、时长和未来的交付/到期时间均为必填；数量范围为 1–1000。',
        requestId: null,
        technicalDetail: 'INVALID_INPUT',
      });
      return;
    }
    const payload: CreateBatchPayload = {
      platform_id: platform.platform_id,
      plan_id: planId,
      name: normalizedName,
      quantity: quantityValue,
      duration_value: duration,
      duration_unit: durationUnit,
      expires_at: expires.toISOString(),
      delivery_deadline: deadline.toISOString(),
      creation_operation_id: crypto.randomUUID(),
    };
    setNotice(null);
    setMutationState('confirm_required');
    setMutationError(null);
    setIntent({
      kind: 'create',
      payload,
      targetId: payload.creation_operation_id,
      title: '创建兑换码批次',
      impact: `将为 ${activePlan.code} 生成 ${payload.quantity} 个一次性兑换码；批次先进入待交付，明文只在成功响应和当前内存面板显示一次。`,
    });
  }

  function openDelivery(batch: Batch) {
    if (!delivery || delivery.batchId !== batch.batch_id || !delivery.receipt) {
      setNotice({
        title: '缺少本次交付凭证',
        description:
          '刷新或响应丢失后不能恢复 receipt，也不能重新导出明文码。请通过支持流程确认批次状态。',
        requestId: null,
        technicalDetail: 'DELIVERY_RECEIPT_UNAVAILABLE',
      });
      return;
    }
    setMutationState('confirm_required');
    setMutationError(null);
    setIntent({
      kind: 'confirm-delivery',
      batchId: batch.batch_id,
      targetId: batch.batch_id,
      title: '确认兑换码已保存并交付',
      impact:
        '服务端会校验当前管理员 session、同一 receipt 和交付期限；确认后批次才会 active，页面会清除明文与 receipt。',
    });
  }

  function openDisable(batch: Batch) {
    setMutationState('confirm_required');
    setMutationError(null);
    setIntent({
      kind: 'disable',
      batchId: batch.batch_id,
      targetId: batch.batch_id,
      title: '停用兑换码批次',
      impact: '停用后该批次不能重新激活；已经兑换产生的权益不会被追溯撤销。',
    });
  }

  async function executeIntent(_reason: string) {
    if (!intent) return;
    setMutationState('pending');
    setMutationError(null);
    try {
      let response: Response;
      if (intent.kind === 'create') {
        response = await adminAuthSession.request(
          '/api/v1/admin/api/v1/redemption-batches',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(intent.payload),
          },
          { replay: 'never' },
        );
        const payload = await readApiPayload<{
          batch_id?: string;
          codes?: Array<{ code?: string }>;
          delivery_receipt?: string;
        }>(response);
        if (!response.ok) {
          if (
            payload?.error?.code === 'MFA_REQUIRED' ||
            payload?.error?.code === 'RECENT_MFA_REQUIRED'
          ) {
            setMutationState('step_up_required');
            return;
          }
          setMutationState('failure');
          setMutationError(resourceError(response, payload, '兑换批次创建'));
          return;
        }
        const batchId = payload?.data?.batch_id;
        const codes =
          payload?.data?.codes
            ?.map((item) => item.code)
            .filter((code): code is string => Boolean(code)) ?? [];
        const receipt = payload?.data?.delivery_receipt;
        if (!batchId || codes.length === 0 || !receipt) {
          setMutationState('failure');
          setMutationError({
            title: '批次已返回但交付材料不完整',
            description:
              '页面不会再次创建批次，也不会伪造或恢复明文码。请通过批次元数据和支持流程确认结果。',
            requestId:
              response.headers.get('x-request-id') ??
              payload?.request_id ??
              null,
            technicalDetail: 'DELIVERY_MATERIAL_MISSING',
          });
          return;
        }
        setDelivery({ batchId, receipt, codes });
        setSecretVisible(true);
        setNotice({
          title: '批次已创建，等待交付确认',
          description:
            '请先复制并安全保存当前明文码，再点击“我已保存”并确认交付。页面不会在通知中显示明文。',
          requestId:
            response.headers.get('x-request-id') ?? payload?.request_id ?? null,
          technicalDetail: null,
        });
        await load(true);
        setIntent(null);
        return;
      }
      const path = `/api/v1/admin/api/v1/redemption-batches/${encodeURIComponent(intent.batchId)}/${intent.kind === 'confirm-delivery' ? 'confirm-delivery' : 'disable'}`;
      const body =
        intent.kind === 'confirm-delivery'
          ? {
              platform_id: platform.platform_id,
              delivery_receipt: delivery?.receipt,
            }
          : { platform_id: platform.platform_id };
      response = await adminAuthSession.request(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Batch>(response);
      if (!response.ok) {
        if (
          payload?.error?.code === 'MFA_REQUIRED' ||
          payload?.error?.code === 'RECENT_MFA_REQUIRED'
        ) {
          setMutationState('step_up_required');
          return;
        }
        setMutationState('failure');
        setMutationError(
          resourceError(
            response,
            payload,
            intent.kind === 'disable' ? '批次停用' : '交付确认',
          ),
        );
        return;
      }
      setMutationState('success');
      setMutationError({
        title: intent.kind === 'disable' ? '批次已停用' : '交付已确认',
        description: '页面正在重新读取服务端批次状态。',
        requestId:
          response.headers.get('x-request-id') ?? payload?.request_id ?? null,
        technicalDetail: null,
      });
      if (intent.kind === 'confirm-delivery') {
        setDelivery(null);
        setSecretVisible(false);
        setNotice({
          title: '交付已确认',
          description:
            '当前批次已由服务端处理；页面已清除本次明文码和 receipt。',
          requestId:
            response.headers.get('x-request-id') ?? payload?.request_id ?? null,
          technicalDetail: null,
        });
      }
      await load(true);
      setIntent(null);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setMutationState('failure');
        setMutationError({
          title: '会话已恢复，请重新提交',
          description:
            '本次批次操作没有自动重放；原交付 receipt 仍只保留在当前内存中。',
          requestId: null,
          technicalDetail: null,
        });
        return;
      }
      setMutationState('unknown_outcome');
      setMutationError({
        title: '批次操作结果待确认',
        description:
          intent.kind === 'create'
            ? '网络在创建响应前中断，页面不会创建第二批；请检查批次元数据并通过支持流程确认。'
            : '网络在服务端响应前中断，页面没有再次提交；请检查权威批次状态后再决定是否重试。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function checkUnknown() {
    await load(true);
    setMutationError({
      title: '批次列表已重新读取',
      description:
        '本次检查没有重新发送原操作；请根据当前状态决定是否需要显式继续。',
      requestId: null,
      technicalDetail: null,
    });
    if (intent?.kind !== 'create') setMutationState('confirm_required');
  }

  const secret = delivery?.codes.join('\n') ?? '';

  return (
    <section
      className="grid gap-5"
      data-test="platform-redemption-batches-page"
    >
      <AdminPageHeader
        title="兑换批次"
        description="创建 pending_delivery 批次、一次性安全交付明文码，并在 receipt 校验后激活；页面不重新导出已生成的兑换码。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
            data-test="batches-refresh"
          >
            {refreshing ? '刷新中…' : '刷新'}
          </Button>
        }
      />
      {refreshError ? (
        <Alert variant="destructive" data-test="batches-refresh-error">
          <AlertTitle>刷新失败，仍保留已知批次</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <SupportErrorId
              requestId={refreshError.requestId}
              technicalDetail={refreshError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert data-test="batches-notice">
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>
            {notice.description}
            <SupportErrorId
              requestId={notice.requestId}
              technicalDetail={notice.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}
      {secretVisible && delivery && secret ? (
        <OneTimeSecretPanel
          secret={secret}
          title="兑换码明文仅显示这一次"
          onAcknowledged={() => {
            setSecretVisible(false);
            setDelivery((current) =>
              current ? { ...current, codes: [] } : null,
            );
          }}
        />
      ) : null}
      {state === 'loading' ? <AsyncState state="loading" /> : null}
      {state === 'error' && error ? (
        <AsyncState
          state="error"
          title={error.title}
          description={error.description}
          requestId={error.requestId}
          technicalDetail={error.technicalDetail}
          onRetry={() => void load(false)}
        />
      ) : null}
      {state === 'success' ? (
        <>
          <section className="panel gap-4" data-test="batch-create-section">
            <div>
              <h2>创建一次性批次</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                先填写元数据，再在确认窗口复核；创建响应丢失时不会自动新建第二批。
              </p>
            </div>
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={openCreateReview}
            >
              <label className="grid gap-2" htmlFor="batch-plan">
                <span className="text-sm font-medium">active paid Plan</span>
                <select
                  id="batch-plan"
                  value={planId}
                  onChange={(event) => setPlanId(event.target.value)}
                  data-test="batch-plan"
                >
                  <option value="">选择 Plan</option>
                  {plans
                    .filter(
                      (plan) =>
                        plan.kind === 'paid' && plan.status === 'active',
                    )
                    .map((plan) => (
                      <option key={plan.plan_id} value={plan.plan_id}>
                        {plan.code} · {plan.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-2" htmlFor="batch-name">
                <span className="text-sm font-medium">批次名称</span>
                <Input
                  id="batch-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：Partner Q4"
                  data-test="batch-name"
                />
              </label>
              <label className="grid gap-2" htmlFor="batch-quantity">
                <span className="text-sm font-medium">数量</span>
                <Input
                  id="batch-quantity"
                  type="number"
                  min={1}
                  max={1000}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  data-test="batch-quantity"
                />
              </label>
              <label className="grid gap-2" htmlFor="batch-duration">
                <span className="text-sm font-medium">每码有效时长</span>
                <Input
                  id="batch-duration"
                  type="number"
                  min={1}
                  value={durationValue}
                  onChange={(event) => setDurationValue(event.target.value)}
                  data-test="batch-duration"
                />
              </label>
              <label className="grid gap-2" htmlFor="batch-duration-unit">
                <span className="text-sm font-medium">时长单位</span>
                <select
                  id="batch-duration-unit"
                  value={durationUnit}
                  onChange={(event) =>
                    setDurationUnit(event.target.value as typeof durationUnit)
                  }
                  data-test="batch-duration-unit"
                >
                  <option value="day">day</option>
                  <option value="month">month</option>
                  <option value="year">year</option>
                </select>
              </label>
              <label className="grid gap-2" htmlFor="batch-expires">
                <span className="text-sm font-medium">
                  批次到期（本地输入，提交为 UTC ISO）
                </span>
                <Input
                  id="batch-expires"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  data-test="batch-expires"
                />
              </label>
              <label className="grid gap-2" htmlFor="batch-delivery-deadline">
                <span className="text-sm font-medium">
                  交付截止（本地输入，提交为 UTC ISO）
                </span>
                <Input
                  id="batch-delivery-deadline"
                  type="datetime-local"
                  value={deliveryDeadline}
                  onChange={(event) => setDeliveryDeadline(event.target.value)}
                  data-test="batch-delivery-deadline"
                />
              </label>
              <div className="flex items-end md:col-span-2">
                <Button
                  type="submit"
                  className="w-fit"
                  data-test="batch-create-open"
                >
                  复核并创建
                </Button>
              </div>
            </form>
          </section>
          <section className="panel gap-4" data-test="batches-table-section">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2>批次目录</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  列表由当前平台范围的真实 API 返回，最多读取 100
                  条；当前合同不支持 cursor。
                </p>
              </div>
              <label className="grid gap-2 sm:w-72" htmlFor="batch-filter">
                <span className="text-sm font-medium">筛选批次</span>
                <Input
                  id="batch-filter"
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="名称、Plan 或状态"
                  data-test="batch-filter"
                />
              </label>
            </div>
            {visibleBatches.length === 0 ? (
              <div
                className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground"
                data-test="batches-empty"
              >
                当前查询暂无批次。
              </div>
            ) : (
              <div
                className="data-table"
                tabIndex={0}
                aria-label="兑换批次列表，可横向滚动"
              >
                <Table className="min-w-[70rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">名称</TableHead>
                      <TableHead scope="col">Plan</TableHead>
                      <TableHead scope="col">数量</TableHead>
                      <TableHead scope="col">状态</TableHead>
                      <TableHead scope="col">到期</TableHead>
                      <TableHead scope="col">交付截止/时间</TableHead>
                      <TableHead scope="col" className="text-right">
                        操作
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleBatches.map((batch) => {
                      const canDisable = batch.status !== 'disabled';
                      const hasReceipt =
                        delivery?.batchId === batch.batch_id &&
                        Boolean(delivery.receipt);
                      return (
                        <TableRow
                          key={batch.batch_id}
                          data-test={`batch-row-${batch.batch_id}`}
                        >
                          <TableCell className="min-w-0 text-left">
                            <strong className="block truncate">
                              {batch.name}
                            </strong>
                            <ResourceId value={batch.batch_id} />
                          </TableCell>
                          <TableCell className="text-left">
                            {batch.plan_code}
                          </TableCell>
                          <TableCell className="text-left">
                            {batch.quantity}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={statusLabel(batch.status)}
                              tone={statusTone(batch.status)}
                              rawValue={batch.status}
                            />
                          </TableCell>
                          <TableCell className="text-left text-sm">
                            {formatUtc(batch.expires_at)}
                          </TableCell>
                          <TableCell className="text-left text-sm">
                            {batch.delivered_at
                              ? formatUtc(batch.delivered_at)
                              : formatUtc(batch.delivery_deadline)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="flex flex-wrap justify-end gap-2">
                              {batch.status === 'pending_delivery' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDelivery(batch)}
                                  disabled={!hasReceipt}
                                  data-test={`batch-confirm-${batch.batch_id}`}
                                >
                                  {hasReceipt ? '确认交付' : '等待本次 receipt'}
                                </Button>
                              ) : null}
                              {canDisable ? (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => openDisable(batch)}
                                  data-test={`batch-disable-${batch.batch_id}`}
                                >
                                  停用
                                </Button>
                              ) : null}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      ) : null}
      {intent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && mutationState !== 'pending') {
              setIntent(null);
              setMutationState('confirm_required');
            }
          }}
          title={intent.title}
          targetIdentity={intent.targetId}
          impact={intent.impact}
          reversible={intent.kind === 'confirm-delivery'}
          state={mutationState}
          error={mutationError}
          stepUpContent={
            mutationState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => {
                  setMutationState('confirm_required');
                  setMutationError(null);
                }}
              />
            ) : null
          }
          onCheckUnknown={
            mutationState === 'unknown_outcome' ? checkUnknown : undefined
          }
          onConfirm={executeIntent}
        />
      ) : null}
    </section>
  );
}
