'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '../../app/_lib/auth/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
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
import { Textarea } from '@kit/ui/textarea';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
  isRecentMfaRequired,
  readApiPayload,
  resourceError,
  resourcePath,
  statusLabel,
  statusTone,
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import { CommerceOffersPanel } from './commerce-offers-panel';

type Plan = {
  plan_id: string;
  code: string;
  name: string;
  description?: string | null;
  kind: 'free' | 'paid';
  features?: Record<string, unknown>;
  status: 'active' | 'archived';
  is_default: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type PlanPayload = {
  plan_id?: string;
  code: string;
  name: string;
  description: string | null;
  kind: Plan['kind'];
  features: Record<string, unknown>;
};

type PlanActionIntent = {
  plan: Plan;
  action: 'archive' | 'make_default' | 'clear_default';
  operationId: string;
  title: string;
  impact: string;
  reversible: boolean;
};

function configSlotLimit(
  features: Record<string, unknown> | undefined,
): number {
  const value = features?.config_slot_limit;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

export function PlatformPlansPage() {
  const { platform } = usePlatformContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [state, setState] = useState<ResourceLoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const [refreshError, setRefreshError] = useState<ResourceError | null>(null);
  const [filter, setFilter] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editorPayload, setEditorPayload] = useState<PlanPayload | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<ResourceError | null>(null);
  const [actionIntent, setActionIntent] = useState<PlanActionIntent | null>(
    null,
  );
  const [actionState, setActionState] =
    useState<MutationState>('confirm_required');
  const [actionError, setActionError] = useState<ResourceError | null>(null);
  const loadGeneration = useRef(0);

  const load = useCallback(
    async (background = false) => {
      const generation = ++loadGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      setRefreshError(null);
      setRefreshing(background);
      if (!background) {
        setState('loading');
        setError(null);
      }
      try {
        const response = await adminAuthSession.request(
          resourcePath(platform.platform_id, '/plans'),
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<Plan[]>(response);
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          const nextError = resourceError(response, payload, '计划列表');
          if (background) setRefreshError(nextError);
          else {
            setError(nextError);
            setState('error');
          }
          return;
        }
        setPlans(payload.data);
        setState('success');
      } catch (caught) {
        if (
          generation !== loadGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError: ResourceError = {
          title: '计划列表读取失败',
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
        if (generation === loadGeneration.current) setRefreshing(false);
      }
    },
    [platform.platform_id],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const visiblePlans = plans.filter((plan) =>
    `${plan.code} ${plan.name} ${plan.kind} ${plan.status}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );

  function openCreate() {
    setEditingPlan(null);
    setEditorPayload({
      code: '',
      name: '',
      description: null,
      kind: 'paid',
      features: { config_slot_limit: 0 },
    });
    setEditorError(null);
    setEditorOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditingPlan(plan);
    setEditorPayload({
      plan_id: plan.plan_id,
      code: plan.code,
      name: plan.name,
      description: plan.description ?? null,
      kind: plan.kind,
      features: {
        ...(plan.features ?? {}),
        config_slot_limit: configSlotLimit(plan.features),
      },
    });
    setEditorError(null);
    setEditorOpen(true);
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editorPayload || editorSaving) return;
    if (
      !editorPayload.code.trim() ||
      !/^[a-z0-9][a-z0-9._-]*$/u.test(editorPayload.code)
    ) {
      setEditorError({
        title: 'Plan code 不正确',
        description:
          '只能使用小写字母、数字、点、下划线和短横线，且必须以字母或数字开头。',
        requestId: null,
        technicalDetail: 'INVALID_INPUT',
      });
      return;
    }
    if (!editorPayload.name.trim()) {
      setEditorError({
        title: '请填写 Plan 名称',
        description: '名称用于管理员识别，不能留空。',
        requestId: null,
        technicalDetail: 'INVALID_INPUT',
      });
      return;
    }
    const slotLimit = editorPayload.features.config_slot_limit;
    if (
      typeof slotLimit !== 'number' ||
      !Number.isInteger(slotLimit) ||
      slotLimit < 0 ||
      slotLimit > 1000
    ) {
      setEditorError({
        title: '配置槽位上限不正确',
        description: '请输入 0–1000 的整数。0 表示该套餐不能创建个人 Config。',
        requestId: null,
        technicalDetail: 'INVALID_INPUT',
      });
      return;
    }
    await saveEditor(editorPayload);
  }

  async function saveEditor(payload: PlanPayload) {
    setEditorSaving(true);
    setEditorError(null);
    try {
      const response = await adminAuthSession.request(
        resourcePath(platform.platform_id, '/plans'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            code: payload.code.trim(),
            name: payload.name.trim(),
            description: payload.description?.trim() || null,
          }),
        },
        { replay: 'never' },
      );
      const responsePayload = await readApiPayload<Plan>(response);
      if (!response.ok) {
        setEditorError(resourceError(response, responsePayload, 'Plan'));
        return;
      }
      setEditorOpen(false);
      await load(true);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setEditorError({
          title: '会话已恢复，请重新提交',
          description: '为避免重复写入，页面没有自动重放 Plan 变更。',
          requestId: null,
          technicalDetail: null,
        });
      } else {
        setEditorError({
          title: 'Plan 保存失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        });
      }
    } finally {
      setEditorSaving(false);
    }
  }

  function openPlanAction(plan: Plan, action: PlanActionIntent['action']) {
    const archive = action === 'archive';
    setActionIntent({
      plan,
      action,
      operationId: crypto.randomUUID(),
      title: archive
        ? `归档 Plan ${plan.code}`
        : action === 'make_default'
          ? `设为默认 Free：${plan.code}`
          : '清空默认 Free Plan',
      impact: archive
        ? '归档会停止新权益授予，但不会删除历史权益；默认 Free Plan 必须先切换或清空。'
        : action === 'make_default'
          ? '该 Free Plan 将成为当前平台的默认回退权益。'
          : '平台将不再配置默认 Free Plan，读取结果会按服务端规则返回 none。',
      reversible: true,
    });
    setActionState('confirm_required');
    setActionError(null);
  }

  async function executePlanAction(reason: string) {
    if (!actionIntent) return;
    setActionState('pending');
    setActionError(null);
    const { plan, action, operationId } = actionIntent;
    try {
      const response = await adminAuthSession.request(
        resourcePath(
          platform.platform_id,
          `/plans/${encodeURIComponent(plan.plan_id)}/commands`,
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            operation_id: operationId,
            reason,
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Plan>(response);
      if (!response.ok) {
        if (isRecentMfaRequired(response, payload)) {
          setActionState('step_up_required');
          return;
        }
        setActionState('failure');
        setActionError(resourceError(response, payload, 'Plan 操作'));
        return;
      }
      setActionState('success');
      setActionError({
        title: 'Plan 已更新',
        description: '页面正在重新读取服务端权威列表。',
        requestId:
          response.headers.get('x-request-id') ?? payload?.request_id ?? null,
        technicalDetail: null,
      });
      await load(true);
      setActionIntent(null);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setActionState('unknown_outcome');
        setActionError({
          title: 'Plan 操作结果待确认',
          description:
            '会话恢复前结果未知；原 operation_id 已保留，再次确认会由服务端安全重放。',
          requestId: null,
          technicalDetail: null,
        });
        return;
      }
      setActionState('unknown_outcome');
      setActionError({
        title: 'Plan 操作结果待确认',
        description:
          '网络在服务端响应前中断；页面没有自动重发，请先刷新 Plan 列表确认当前状态。',
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  return (
    <section className="grid gap-5" data-test="platform-plans-page">
      <AdminPageHeader
        title="套餐"
        description="管理免费与付费套餐、默认免费套餐和归档状态。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={refreshing}
              data-test="plans-refresh"
            >
              {refreshing ? '刷新中…' : '刷新'}
            </Button>
            <Button size="sm" onClick={openCreate} data-test="plan-create-open">
              创建 Plan
            </Button>
          </div>
        }
      />
      {refreshError ? (
        <Alert variant="destructive" data-test="plans-refresh-error">
          <AlertTitle>刷新失败，仍保留已知列表</AlertTitle>
          <AlertDescription>
            {refreshError.description}
            <SupportErrorId
              requestId={refreshError.requestId}
              technicalDetail={refreshError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}
      <section className="panel gap-3">
        <label className="grid gap-2" htmlFor="plans-filter">
          <span className="text-sm font-medium">筛选 Plan</span>
          <Input
            id="plans-filter"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="code、名称、kind 或 status"
            data-test="plans-filter"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          筛选当前已加载的套餐；未返回的套餐不包含在搜索结果中。
        </p>
      </section>
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
      {state === 'success' && plans.length === 0 ? (
        <section className="panel gap-2" data-test="plans-empty">
          <h2>还没有 Plan</h2>
          <p className="text-sm text-muted-foreground">
            当前平台没有返回 Plan；可以创建一个 active Plan，服务端会校验
            kind、状态和默认约束。
          </p>
        </section>
      ) : null}
      {state === 'success' && plans.length > 0 && visiblePlans.length === 0 ? (
        <section className="panel gap-2" data-test="plans-filter-empty">
          <h2>没有匹配的 Plan</h2>
          <p className="text-sm text-muted-foreground">
            清除筛选后查看当前平台已返回的全部 Plan。
          </p>
        </section>
      ) : null}
      {state === 'success' && visiblePlans.length > 0 ? (
        <section className="panel gap-4" data-test="plans-table-section">
          <div>
            <h2>Plan 目录</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              共显示 {visiblePlans.length} 条真实记录；默认 Free
              由服务端平台配置决定。
            </p>
          </div>
          <div
            className="data-table"
            tabIndex={0}
            aria-label="Plan 列表，可横向滚动"
          >
            <Table className="min-w-[64rem]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">code / 名称</TableHead>
                  <TableHead scope="col">描述</TableHead>
                  <TableHead scope="col">类型</TableHead>
                  <TableHead scope="col">状态</TableHead>
                  <TableHead scope="col">features 摘要</TableHead>
                  <TableHead scope="col" className="text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePlans.map((plan) => (
                  <TableRow
                    key={plan.plan_id}
                    data-test={`plan-row-${plan.plan_id}`}
                  >
                    <TableCell className="min-w-0 text-left">
                      <strong className="block truncate">{plan.code}</strong>
                      <span className="block truncate text-sm text-muted-foreground">
                        {plan.name}
                      </span>
                      {plan.is_default ? (
                        <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          默认 Free
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-left text-sm">
                      <span className="line-clamp-2">
                        {plan.description || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-left text-sm">
                      {plan.kind === 'free' ? 'Free' : 'paid'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={statusLabel(plan.status)}
                        tone={statusTone(plan.status)}
                        rawValue={plan.status}
                      />
                    </TableCell>
                    <TableCell className="break-words text-left text-sm">
                      配置槽位 {configSlotLimit(plan.features)} ·{' '}
                      {plan.features && Object.keys(plan.features).length > 0
                        ? `${Object.keys(plan.features).length} 个 features 字段`
                        : '无其他字段'}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(plan)}
                          data-test={`plan-edit-${plan.plan_id}`}
                        >
                          编辑
                        </Button>
                        {plan.status === 'active' && !plan.is_default ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openPlanAction(plan, 'archive')}
                            data-test={`plan-archive-${plan.plan_id}`}
                          >
                            归档
                          </Button>
                        ) : null}
                        {plan.kind === 'free' &&
                        plan.status === 'active' &&
                        !plan.is_default ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPlanAction(plan, 'make_default')}
                            data-test={`plan-default-${plan.plan_id}`}
                          >
                            设为默认
                          </Button>
                        ) : null}
                        {plan.is_default ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openPlanAction(plan, 'clear_default')
                            }
                            data-test={`plan-clear-default-${plan.plan_id}`}
                          >
                            清空默认
                          </Button>
                        ) : null}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {state === 'success' ? (
        <CommerceOffersPanel platformId={platform.platform_id} plans={plans} />
      ) : null}

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!editorSaving) setEditorOpen(open);
        }}
      >
        <DialogContent data-test="plan-editor-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? `编辑套餐 ${editingPlan.code}` : '创建套餐'}
            </DialogTitle>
            <DialogDescription>
              设置套餐信息与权益配置。请核对字段后保存。
            </DialogDescription>
          </DialogHeader>
          {editorPayload ? (
            <form className="grid gap-4" onSubmit={submitEditor}>
              <div className="grid gap-2">
                <Label htmlFor="plan-editor-code">Plan code</Label>
                <Input
                  id="plan-editor-code"
                  value={editorPayload.code}
                  onChange={(event) =>
                    setEditorPayload({
                      ...editorPayload,
                      code: event.target.value,
                    })
                  }
                  disabled={Boolean(editingPlan) || editorSaving}
                  data-test="plan-editor-code"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plan-editor-name">名称</Label>
                <Input
                  id="plan-editor-name"
                  value={editorPayload.name}
                  onChange={(event) =>
                    setEditorPayload({
                      ...editorPayload,
                      name: event.target.value,
                    })
                  }
                  disabled={editorSaving}
                  data-test="plan-editor-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plan-editor-kind">类型</Label>
                <select
                  id="plan-editor-kind"
                  value={editorPayload.kind}
                  onChange={(event) =>
                    setEditorPayload({
                      ...editorPayload,
                      kind: event.target.value as Plan['kind'],
                    })
                  }
                  disabled={Boolean(editingPlan?.is_default) || editorSaving}
                  data-test="plan-editor-kind"
                >
                  <option value="paid">paid</option>
                  <option value="free">free</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plan-editor-description">描述</Label>
                <Textarea
                  id="plan-editor-description"
                  value={editorPayload.description ?? ''}
                  onChange={(event) =>
                    setEditorPayload({
                      ...editorPayload,
                      description: event.target.value,
                    })
                  }
                  disabled={editorSaving}
                  maxLength={4096}
                  data-test="plan-editor-description"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plan-editor-config-slot-limit">
                  配置槽位上限
                </Label>
                <Input
                  id="plan-editor-config-slot-limit"
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  value={configSlotLimit(editorPayload.features)}
                  onChange={(event) =>
                    setEditorPayload({
                      ...editorPayload,
                      features: {
                        ...editorPayload.features,
                        config_slot_limit: Number(event.target.value),
                      },
                    })
                  }
                  disabled={editorSaving}
                  data-test="plan-editor-config-slot-limit"
                />
                <p className="text-xs text-muted-foreground">
                  只更新 features.config_slot_limit；其他 feature keys
                  会原样保留。范围 0–1000。
                </p>
              </div>
              {editorError ? (
                <Alert variant="destructive" data-test="plan-editor-error">
                  <AlertTitle>{editorError.title}</AlertTitle>
                  <AlertDescription>
                    {editorError.description}
                    <SupportErrorId
                      requestId={editorError.requestId}
                      technicalDetail={editorError.technicalDetail}
                    />
                  </AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditorOpen(false)}
                  disabled={editorSaving}
                  data-test="plan-editor-cancel"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={editorSaving}
                  data-test="plan-editor-submit"
                >
                  {editorSaving
                    ? '保存中…'
                    : editingPlan
                      ? '保存修改'
                      : '创建 Plan'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {actionIntent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && actionState !== 'pending') {
              setActionIntent(null);
              setActionState('confirm_required');
            }
          }}
          title={actionIntent.title}
          targetIdentity={actionIntent.plan.plan_id}
          impact={actionIntent.impact}
          reversible={actionIntent.reversible}
          reasonRequired
          state={actionState}
          error={actionError}
          stepUpContent={
            actionState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => setActionState('confirm_required')}
              />
            ) : null
          }
          onCheckUnknown={
            actionState === 'unknown_outcome'
              ? async () => {
                  await load(true);
                  setActionError({
                    title: 'Plan 列表已重新读取',
                    description:
                      '原 operation_id 已保留；若结果仍不确定，可再次确认并安全重放同一操作。',
                    requestId: null,
                    technicalDetail: null,
                  });
                }
              : undefined
          }
          onConfirm={executePlanAction}
        />
      ) : null}
    </section>
  );
}
