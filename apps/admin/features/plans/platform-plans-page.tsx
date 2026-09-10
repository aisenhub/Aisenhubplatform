'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
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
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
import {
  adminAuthSession,
  sessionErrorMessage,
} from '../../app/_lib/auth-session';
import {
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
  status: Plan['status'];
  make_default: boolean;
  clear_default: boolean;
};

type PlanActionIntent = {
  plan: Plan;
  changes: Pick<PlanPayload, 'status' | 'make_default' | 'clear_default'>;
  title: string;
  impact: string;
  reversible: boolean;
};

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
  const [editorNeedsStepUp, setEditorNeedsStepUp] = useState(false);
  const [editorVerified, setEditorVerified] = useState(false);
  const [actionIntent, setActionIntent] = useState<PlanActionIntent | null>(
    null,
  );
  const [actionState, setActionState] =
    useState<MutationState>('confirm_required');
  const [actionError, setActionError] = useState<ResourceError | null>(null);

  const load = useCallback(
    async (background = false) => {
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
        setRefreshing(false);
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
      features: {},
      status: 'active',
      make_default: false,
      clear_default: false,
    });
    setEditorError(null);
    setEditorNeedsStepUp(false);
    setEditorVerified(false);
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
      features: plan.features ?? {},
      status: plan.status,
      make_default: false,
      clear_default: false,
    });
    setEditorError(null);
    setEditorNeedsStepUp(false);
    setEditorVerified(false);
    setEditorOpen(true);
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editorPayload || editorSaving || editorNeedsStepUp) return;
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
        if (
          responsePayload?.error?.code === 'MFA_REQUIRED' ||
          responsePayload?.error?.code === 'RECENT_MFA_REQUIRED'
        ) {
          setEditorNeedsStepUp(true);
          setEditorVerified(false);
          return;
        }
        setEditorError(resourceError(response, responsePayload, 'Plan'));
        return;
      }
      setEditorOpen(false);
      setEditorNeedsStepUp(false);
      setEditorVerified(false);
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

  function openPlanAction(plan: Plan, changes: PlanActionIntent['changes']) {
    const archive = changes.status === 'archived';
    setActionIntent({
      plan,
      changes,
      title: archive
        ? `归档 Plan ${plan.code}`
        : changes.make_default
          ? `设为默认 Free：${plan.code}`
          : '清空默认 Free Plan',
      impact: archive
        ? '归档会停止新权益授予，但不会删除历史权益；默认 Free Plan 必须先切换或清空。'
        : changes.make_default
          ? '该 Free Plan 将成为当前平台的默认回退权益。'
          : '平台将不再配置默认 Free Plan，读取结果会按服务端规则返回 none。',
      reversible: true,
    });
    setActionState('confirm_required');
    setActionError(null);
  }

  async function executePlanAction() {
    if (!actionIntent) return;
    setActionState('pending');
    setActionError(null);
    const { plan, changes } = actionIntent;
    try {
      const response = await adminAuthSession.request(
        resourcePath(platform.platform_id, '/plans'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_id: plan.plan_id,
            code: plan.code,
            name: plan.name,
            description: plan.description ?? null,
            kind: plan.kind,
            features: plan.features ?? {},
            status: changes.status,
            make_default: changes.make_default,
            clear_default: changes.clear_default,
          }),
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<Plan>(response);
      if (!response.ok) {
        if (
          payload?.error?.code === 'MFA_REQUIRED' ||
          payload?.error?.code === 'RECENT_MFA_REQUIRED'
        ) {
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
        setActionState('failure');
        setActionError({
          title: '会话已恢复，请重新提交',
          description: '为避免重复写入，这次 Plan 操作没有自动重放。',
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
        title="平台计划"
        description="管理当前平台的 Free/paid Plan、默认 Free 回退和归档状态；features 只按服务端真实字段显示摘要。"
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
          Plan API 当前不声明 q/cursor
          参数，筛选只作用于已返回的本页数据，不改变服务端授权范围。
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
                      {plan.features && Object.keys(plan.features).length > 0
                        ? `${Object.keys(plan.features).length} 个字段`
                        : '空对象'}
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
                            onClick={() =>
                              openPlanAction(plan, {
                                status: 'archived',
                                make_default: false,
                                clear_default: false,
                              })
                            }
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
                            onClick={() =>
                              openPlanAction(plan, {
                                status: plan.status,
                                make_default: true,
                                clear_default: false,
                              })
                            }
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
                              openPlanAction(plan, {
                                status: plan.status,
                                make_default: false,
                                clear_default: true,
                              })
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

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!editorSaving && !editorNeedsStepUp) setEditorOpen(open);
        }}
      >
        <DialogContent data-test="plan-editor-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? `编辑 Plan ${editingPlan.code}` : '创建 Plan'}
            </DialogTitle>
            <DialogDescription>
              只提交当前 Plan contract 支持的字段；features
              作为结构化对象保留，页面不会自行计算权益。
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
                  disabled={
                    Boolean(editingPlan) || editorSaving || editorNeedsStepUp
                  }
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
                  disabled={editorSaving || editorNeedsStepUp}
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
                  disabled={
                    Boolean(editingPlan?.is_default) ||
                    editorSaving ||
                    editorNeedsStepUp
                  }
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
                  disabled={editorSaving || editorNeedsStepUp}
                  maxLength={4096}
                  data-test="plan-editor-description"
                />
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
              {editorNeedsStepUp ? (
                <Alert data-test="plan-editor-step-up">
                  <AlertTitle>需要近期 MFA</AlertTitle>
                  <AlertDescription>
                    保存草稿仍在当前窗口；验证完成后必须显式再次点击提交，不会自动重放。
                    <div className="mt-3">
                      <AdminRecentMfaPanel
                        onVerified={() => {
                          setEditorNeedsStepUp(false);
                          setEditorVerified(true);
                        }}
                      />
                    </div>
                  </AlertDescription>
                </Alert>
              ) : null}
              {editorVerified ? (
                <Alert>
                  <AlertTitle>MFA 已验证</AlertTitle>
                  <AlertDescription>
                    草稿未改变；请再次点击保存提交同一份 Plan 变更。
                  </AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditorOpen(false)}
                  disabled={editorSaving || editorNeedsStepUp}
                  data-test="plan-editor-cancel"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={editorSaving || editorNeedsStepUp}
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
          state={actionState}
          error={actionError}
          stepUpContent={
            actionState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => {
                  setActionState('confirm_required');
                  setActionError(null);
                }}
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
                      '没有重新发送原操作；请根据当前状态决定是否需要新的显式确认。',
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
