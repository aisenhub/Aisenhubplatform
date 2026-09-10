'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceId } from '@kit/ui/resource-id';
import { ResourceInspector } from '@kit/ui/resource-inspector';
import { StatusBadge } from '@kit/ui/status-badge';
import { SupportErrorId } from '@kit/ui/support-error-id';

import { AdminPageHeader } from '../../components/shell/admin-page-header';
import { usePlatformContext } from '../../components/platform-context/platform-workspace';
import { AdminRecentMfaPanel } from '../security/admin-recent-mfa-panel';
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
  type ResourceError,
  type ResourceLoadState,
} from '../resources/admin-resource-utils';

type Policy = {
  enabled: boolean;
  max_file_bytes: number;
  max_files: number;
  max_total_bytes: number;
  reserved_bytes?: number;
  reserved_count?: number;
  available_bytes?: number;
  available_count?: number;
  over_quota?: boolean;
  updated_at?: string | null;
};

type ConfigFile = {
  file_id: string;
  platform_id: string | null;
  platform_account_id: string | null;
  original_name: string | null;
  mime_type: string | null;
  status: string;
  write_outcome: string;
  reserved_bytes: number;
  reserved_count: number;
  actual_size_bytes: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  cancel_requested_at?: string | null;
};

type DeleteIntent = {
  fileId: string;
  name: string;
  idempotencyKey: string;
};

type DownloadTarget = {
  fileId: string;
  name: string;
};

type DetailState = 'idle' | 'loading' | 'success' | 'error';

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function fileStatus(file: ConfigFile): {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'unknown';
} {
  if (file.write_outcome === 'unknown') {
    return { label: '正在确认写入结果', tone: 'warning' };
  }
  switch (file.status) {
    case 'active':
      return { label: '活跃', tone: 'success' };
    case 'receiving':
      return { label: '正在接收', tone: 'warning' };
    case 'storing':
      return { label: '正在写入', tone: 'warning' };
    case 'pending':
      return { label: '待处理', tone: 'warning' };
    case 'deleting':
      return { label: '删除处理中', tone: 'warning' };
    case 'deleted':
      return { label: '已删除', tone: 'neutral' };
    case 'failed':
      return { label: '失败', tone: 'danger' };
    case 'expired':
      return { label: '已过期', tone: 'danger' };
    default:
      return { label: statusLabel(file.status), tone: 'unknown' };
  }
}

function fileStateNote(file: ConfigFile): string | null {
  if (file.write_outcome === 'unknown') {
    return '写入结果未知，预算仍被占用。请检查权威状态，不要重复上传或强制释放。';
  }
  if (file.status === 'deleting') {
    return '删除请求已受理，Storage 与预算尚未完成结算。页面不会宣称对象已物理删除。';
  }
  if (['pending', 'receiving', 'storing'].includes(file.status)) {
    return '文件仍在写入状态，下载和重复删除由服务端状态机控制。';
  }
  return null;
}

function apiError(
  response: Response,
  payload: {
    error?: { code?: string; message?: string };
    request_id?: string;
  } | null,
  title: string,
): ResourceError {
  return resourceError(response, payload, title);
}

export function PlatformFilesPage() {
  const { platform } = usePlatformContext();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const cursor = searchParams.get('cursor');
  const [draftQuery, setDraftQuery] = useState(query);
  const [files, setFiles] = useState<ConfigFile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fileState, setFileState] = useState<ResourceLoadState>('loading');
  const [fileError, setFileError] = useState<ResourceError | null>(null);
  const [fileRefreshError, setFileRefreshError] =
    useState<ResourceError | null>(null);
  const [refreshingFiles, setRefreshingFiles] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyState, setPolicyState] = useState<ResourceLoadState>('loading');
  const [policyError, setPolicyError] = useState<ResourceError | null>(null);
  const [policyRefreshError, setPolicyRefreshError] =
    useState<ResourceError | null>(null);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyNeedsStepUp, setPolicyNeedsStepUp] = useState(false);
  const [policyErrorMessage, setPolicyErrorMessage] =
    useState<ResourceError | null>(null);
  const [deletingFileIds, setDeletingFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [downloadingFileIds, setDownloadingFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent | null>(null);
  const [deleteState, setDeleteState] =
    useState<MutationState>('confirm_required');
  const [deleteError, setDeleteError] = useState<ResourceError | null>(null);
  const [downloadTarget, setDownloadTarget] = useState<DownloadTarget | null>(
    null,
  );
  const [downloadNeedsStepUp, setDownloadNeedsStepUp] = useState(false);
  const [downloadError, setDownloadError] = useState<ResourceError | null>(
    null,
  );
  const [inspectorFileId, setInspectorFileId] = useState<string | null>(null);
  const [inspectedFile, setInspectedFile] = useState<ConfigFile | null>(null);
  const [inspectorState, setInspectorState] = useState<DetailState>('idle');
  const [inspectorError, setInspectorError] = useState<ResourceError | null>(
    null,
  );
  const fileGeneration = useRef(0);
  const policyGeneration = useRef(0);
  const detailGeneration = useRef(0);

  useEffect(() => setDraftQuery(query), [query]);

  const loadFiles = useCallback(
    async (background = false) => {
      const generation = ++fileGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      setFileRefreshError(null);
      setRefreshingFiles(background);
      if (!background) {
        setFileState('loading');
        setFileError(null);
      }
      try {
        const params = new URLSearchParams({
          platform_id: platform.platform_id,
          limit: '20',
        });
        if (query.trim()) params.set('q', query.trim());
        if (cursor) params.set('cursor', cursor);
        const response = await adminAuthSession.request(
          `/api/v1/admin/api/v1/config-files?${params.toString()}`,
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<ConfigFile[]>(response);
        if (
          generation !== fileGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !Array.isArray(payload?.data)) {
          const nextError = apiError(response, payload, '文件列表');
          if (background) setFileRefreshError(nextError);
          else {
            setFileError(nextError);
            setFileState('error');
          }
          return;
        }
        setFiles(payload.data);
        setNextCursor(payload?.next_cursor ?? null);
        setFileState('success');
      } catch (caught) {
        if (
          generation !== fileGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError: ResourceError = {
          title: '文件列表读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        };
        if (background) setFileRefreshError(nextError);
        else {
          setFileError(nextError);
          setFileState('error');
        }
      } finally {
        if (generation === fileGeneration.current) setRefreshingFiles(false);
      }
    },
    [cursor, platform.platform_id, query],
  );

  const loadPolicy = useCallback(
    async (background = false) => {
      const generation = ++policyGeneration.current;
      const epoch = adminAuthSession.getEpoch();
      setPolicyRefreshError(null);
      if (!background) {
        setPolicyState('loading');
        setPolicyError(null);
      }
      try {
        const response = await adminAuthSession.request(
          resourcePath(platform.platform_id, '/file-policy'),
          { cache: 'no-store' },
        );
        const payload = await readApiPayload<Policy>(response);
        if (
          generation !== policyGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        if (!response.ok || !payload?.data) {
          const nextError = apiError(response, payload, '文件策略');
          if (background) setPolicyRefreshError(nextError);
          else {
            setPolicyError(nextError);
            setPolicyState('error');
          }
          return;
        }
        setPolicy(payload.data);
        setPolicyState('success');
      } catch (caught) {
        if (
          generation !== policyGeneration.current ||
          !adminAuthSession.isCurrentEpoch(epoch)
        )
          return;
        const nextError: ResourceError = {
          title: '文件策略读取失败',
          description: sessionErrorMessage(caught),
          requestId: null,
          technicalDetail: null,
        };
        if (background) setPolicyRefreshError(nextError);
        else {
          setPolicyError(nextError);
          setPolicyState('error');
        }
      }
    },
    [platform.platform_id],
  );

  useEffect(() => {
    void loadFiles(false);
  }, [loadFiles]);

  useEffect(() => {
    void loadPolicy(false);
  }, [loadPolicy]);

  function applyQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (draftQuery.trim()) params.set('q', draftQuery.trim());
    else params.delete('q');
    params.delete('cursor');
    router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  function goToCursor(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('cursor', value);
    else params.delete('cursor');
    router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy || policySaving || policyNeedsStepUp) return;
    setPolicySaving(true);
    setPolicyErrorMessage(null);
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
      if (!response.ok) {
        if (
          payload?.error?.code === 'RECENT_MFA_REQUIRED' ||
          payload?.error?.code === 'MFA_REQUIRED'
        ) {
          setPolicyNeedsStepUp(true);
          setPolicyErrorMessage(null);
        } else {
          setPolicyErrorMessage(apiError(response, payload, '文件策略'));
        }
        return;
      }
      setPolicyNeedsStepUp(false);
      await loadPolicy(true);
    } catch (caught) {
      setPolicyErrorMessage({
        title: '策略保存结果待确认',
        description:
          caught instanceof SessionRetryRequiredError
            ? '会话已恢复，本次保存没有自动重放；请核对策略后再次提交。'
            : sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    } finally {
      setPolicySaving(false);
    }
  }

  async function openInspector(fileId: string) {
    const generation = ++detailGeneration.current;
    setInspectorFileId(fileId);
    setInspectedFile(null);
    setInspectorError(null);
    setInspectorState('loading');
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/config-files/${encodeURIComponent(fileId)}`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<ConfigFile>(response);
      if (generation !== detailGeneration.current) return;
      if (!response.ok || !payload?.data) {
        setInspectorError(apiError(response, payload, '文件详情'));
        setInspectorState('error');
        return;
      }
      if (payload.data.platform_id !== platform.platform_id) {
        setInspectorError({
          title: '文件平台范围不一致',
          description:
            '服务端返回的文件不属于当前平台，页面不会继续展示或操作它。',
          requestId: response.headers.get('x-request-id'),
          technicalDetail: 'PLATFORM_SCOPE_MISMATCH',
        });
        setInspectorState('error');
        return;
      }
      setInspectedFile(payload.data);
      setInspectorState('success');
    } catch (caught) {
      if (generation !== detailGeneration.current) return;
      setInspectorError({
        title: '文件详情读取失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
      setInspectorState('error');
    }
  }

  function openDelete(file: ConfigFile) {
    setDeleteIntent({
      fileId: file.file_id,
      name: file.original_name ?? '未命名文件',
      idempotencyKey: crypto.randomUUID(),
    });
    setDeleteState('confirm_required');
    setDeleteError(null);
  }

  async function submitDelete() {
    if (!deleteIntent) return;
    setDeleteState('pending');
    setDeleteError(null);
    setDeletingFileIds((current) => new Set(current).add(deleteIntent.fileId));
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/config-files/${encodeURIComponent(deleteIntent.fileId)}`,
        {
          method: 'DELETE',
          headers: { 'Idempotency-Key': deleteIntent.idempotencyKey },
        },
        { replay: 'never' },
      );
      const payload = await readApiPayload<ConfigFile>(response);
      if (!response.ok) {
        if (
          payload?.error?.code === 'RECENT_MFA_REQUIRED' ||
          payload?.error?.code === 'MFA_REQUIRED'
        ) {
          setDeleteState('step_up_required');
          return;
        }
        setDeleteState('failure');
        setDeleteError(apiError(response, payload, '文件删除'));
        return;
      }
      setDeleteState(response.status === 202 ? 'accepted' : 'success');
      await loadFiles(true);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setDeleteState('failure');
        setDeleteError({
          title: '会话已恢复，请重新提交',
          description:
            '为避免重复删除，本次请求没有自动重放。原删除 intent 仍保留。',
          requestId: null,
          technicalDetail: null,
        });
      } else {
        setDeleteState('unknown_outcome');
        setDeleteError({
          title: '删除结果待确认',
          description:
            '网络在服务端响应前中断。请先检查权威文件状态，不要立即发起第二次删除。',
          requestId: null,
          technicalDetail: null,
        });
      }
    } finally {
      setDeletingFileIds((current) => {
        const next = new Set(current);
        next.delete(deleteIntent.fileId);
        return next;
      });
    }
  }

  async function checkDeleteUnknown() {
    if (!deleteIntent) return;
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/config-files/${encodeURIComponent(deleteIntent.fileId)}`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<ConfigFile>(response);
      if (response.ok && payload?.data) {
        setInspectedFile(payload.data);
        await loadFiles(true);
        if (
          payload.data.status === 'deleting' ||
          payload.data.status === 'deleted'
        ) {
          setDeleteState('accepted');
          setDeleteError({
            title: '删除状态已收敛',
            description:
              payload.data.status === 'deleted'
                ? '服务端已报告 deleted；预算是否释放仍以领域结算为准。'
                : '服务端已报告 deleting；物理删除和预算释放仍待后续结算。',
            requestId: response.headers.get('x-request-id'),
            technicalDetail: payload.data.status,
          });
        } else {
          setDeleteError({
            title: '当前状态未证明原请求结果',
            description:
              '页面不会根据 unchanged 状态推断删除失败，也不会自动重发相同请求。请联系支持流程确认后再决定下一步。',
            requestId: response.headers.get('x-request-id'),
            technicalDetail: 'UNKNOWN_OUTCOME',
          });
        }
        return;
      }
      setDeleteError(apiError(response, payload, '文件权威状态'));
    } catch (caught) {
      setDeleteError({
        title: '状态检查失败',
        description: sessionErrorMessage(caught),
        requestId: null,
        technicalDetail: null,
      });
    }
  }

  async function downloadFile(target: DownloadTarget) {
    setDownloadingFileIds((current) => new Set(current).add(target.fileId));
    setDownloadError(null);
    try {
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/config-files/${encodeURIComponent(target.fileId)}/content`,
        { cache: 'no-store' },
      );
      const payload = await readApiPayload<unknown>(response);
      if (!response.ok) {
        if (
          payload?.error?.code === 'RECENT_MFA_REQUIRED' ||
          payload?.error?.code === 'MFA_REQUIRED'
        ) {
          setDownloadTarget(target);
          setDownloadNeedsStepUp(true);
          return;
        }
        setDownloadError(apiError(response, payload, '文件下载'));
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = target.name || 'config-file';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setDownloadTarget(null);
      setDownloadNeedsStepUp(false);
    } catch (caught) {
      setDownloadError({
        title: '下载流结果待确认',
        description:
          '网络中断不等于文件不存在。请检查网络后按需重新打开文件状态。',
        requestId: null,
        technicalDetail:
          caught instanceof SessionRetryRequiredError
            ? 'SESSION_RECOVERY_REQUIRED'
            : null,
      });
    } finally {
      setDownloadingFileIds((current) => {
        const next = new Set(current);
        next.delete(target.fileId);
        return next;
      });
    }
  }

  const unknownFiles = useMemo(
    () =>
      files.filter(
        (file) =>
          file.write_outcome === 'unknown' || file.status === 'deleting',
      ),
    [files],
  );

  if (fileState === 'loading' && policyState === 'loading') {
    return (
      <section className="grid gap-5" data-test="platform-files-loading">
        <AdminPageHeader
          title="配置文件"
          description="平台范围内的文件状态、策略和受控下载。"
        />
        <AsyncState state="loading" />
      </section>
    );
  }

  return (
    <section className="grid gap-5" data-test="platform-files-page">
      <AdminPageHeader
        title="配置文件"
        description="文件通过 Admin API 读取；浏览器不直连 Storage，不把列表消失当作物理删除或预算释放。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void loadFiles(true);
              void loadPolicy(true);
            }}
            disabled={refreshingFiles}
            data-test="platform-files-refresh"
          >
            {refreshingFiles ? '刷新中…' : '刷新'}
          </Button>
        }
      />

      {fileError && fileState === 'error' ? (
        <AsyncState
          state={
            fileError.technicalDetail === 'ADMIN_REQUIRED' ? 'access' : 'error'
          }
          title={fileError.title}
          description={fileError.description}
          requestId={fileError.requestId}
          technicalDetail={fileError.technicalDetail}
          onRetry={() => void loadFiles(false)}
        />
      ) : null}
      {policyError && policyState === 'error' ? (
        <AsyncState
          state={
            policyError.technicalDetail === 'ADMIN_REQUIRED'
              ? 'access'
              : 'error'
          }
          title={policyError.title}
          description={policyError.description}
          requestId={policyError.requestId}
          technicalDetail={policyError.technicalDetail}
          onRetry={() => void loadPolicy(false)}
        />
      ) : null}
      {fileRefreshError || policyRefreshError ? (
        <Alert variant="destructive" data-test="platform-files-refresh-error">
          <AlertTitle>刷新未完成</AlertTitle>
          <AlertDescription>
            {fileRefreshError?.description ?? policyRefreshError?.description}
            <SupportErrorId
              requestId={
                fileRefreshError?.requestId ?? policyRefreshError?.requestId
              }
              technicalDetail={
                fileRefreshError?.technicalDetail ??
                policyRefreshError?.technicalDetail
              }
            />
          </AlertDescription>
        </Alert>
      ) : null}
      {downloadTarget ? (
        <Alert data-test="platform-files-download-step-up">
          <AlertTitle>
            {downloadNeedsStepUp
              ? '下载需要近期 MFA'
              : 'MFA 已验证，请继续下载'}
          </AlertTitle>
          <AlertDescription>
            原下载目标已保留；验证成功后不会自动重放，请显式点击继续下载。
            <div className="mt-3 grid gap-3">
              {downloadNeedsStepUp ? (
                <AdminRecentMfaPanel
                  onVerified={() => setDownloadNeedsStepUp(false)}
                />
              ) : null}
              {!downloadNeedsStepUp ? (
                <Button
                  size="sm"
                  className="w-fit"
                  onClick={() => void downloadFile(downloadTarget)}
                  data-test="platform-files-download-after-mfa"
                >
                  继续下载
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {downloadError ? (
        <Alert variant="destructive" data-test="platform-files-download-error">
          <AlertTitle>{downloadError.title}</AlertTitle>
          <AlertDescription>
            {downloadError.description}
            <SupportErrorId
              requestId={downloadError.requestId}
              technicalDetail={downloadError.technicalDetail}
            />
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="panel gap-4" data-test="platform-file-policy">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2>Usage / Policy</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                配额与策略只展示服务端事实；下调策略不会自动删除文件。
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
          {policy ? (
            <form className="grid gap-4" onSubmit={savePolicy}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policy.enabled}
                  onChange={(event) =>
                    setPolicy({ ...policy, enabled: event.target.checked })
                  }
                  disabled={policySaving || policyNeedsStepUp}
                  data-test="platform-file-policy-enabled"
                />
                策略启用
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <PolicyNumber
                  id="file-policy-max-bytes"
                  label="单文件上限（字节）"
                  value={policy.max_file_bytes}
                  max={1048576}
                  disabled={policySaving || policyNeedsStepUp}
                  onChange={(value) =>
                    setPolicy({ ...policy, max_file_bytes: value })
                  }
                />
                <PolicyNumber
                  id="file-policy-max-files"
                  label="文件数量上限"
                  value={policy.max_files}
                  disabled={policySaving || policyNeedsStepUp}
                  onChange={(value) =>
                    setPolicy({ ...policy, max_files: value })
                  }
                />
                <PolicyNumber
                  id="file-policy-max-total"
                  label="总字节上限"
                  value={policy.max_total_bytes}
                  disabled={policySaving || policyNeedsStepUp}
                  onChange={(value) =>
                    setPolicy({ ...policy, max_total_bytes: value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                <Metric
                  label="已预约字节"
                  value={formatBytes(policy.reserved_bytes)}
                />
                <Metric
                  label="已预约文件"
                  value={`${policy.reserved_count ?? '—'}`}
                />
                <Metric
                  label="剩余字节"
                  value={formatBytes(policy.available_bytes)}
                />
                <Metric
                  label="剩余文件"
                  value={`${policy.available_count ?? '—'}`}
                />
              </div>
              {policy.over_quota ? (
                <Alert data-test="platform-file-policy-over-quota">
                  <AlertTitle>当前使用量高于策略</AlertTitle>
                  <AlertDescription>
                    服务端会阻止新增或替换，不会在客户端自动删除既有文件。
                  </AlertDescription>
                </Alert>
              ) : null}
              {policyNeedsStepUp ? (
                <AdminRecentMfaPanel
                  onVerified={() => setPolicyNeedsStepUp(false)}
                />
              ) : null}
              {policyErrorMessage ? (
                <Alert
                  variant="destructive"
                  data-test="platform-file-policy-error"
                >
                  <AlertTitle>{policyErrorMessage.title}</AlertTitle>
                  <AlertDescription>
                    {policyErrorMessage.description}
                    <SupportErrorId
                      requestId={policyErrorMessage.requestId}
                      technicalDetail={policyErrorMessage.technicalDetail}
                    />
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button
                type="submit"
                className="w-fit"
                disabled={policySaving || policyNeedsStepUp}
                data-test="platform-file-policy-save"
              >
                {policySaving ? '保存中…' : '保存策略（需近期 MFA）'}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              当前没有可展示的策略数据。
            </p>
          )}
        </section>

        <section className="panel gap-4" data-test="platform-file-table">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2>文件状态</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                当前平台范围由服务端分页；不会先拉全局列表再在浏览器过滤。
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {refreshingFiles ? '后台刷新中…' : '每页 20 条'}
            </span>
          </div>
          <form className="flex gap-2" onSubmit={applyQuery}>
            <Label htmlFor="platform-file-query" className="sr-only">
              搜索文件
            </Label>
            <Input
              id="platform-file-query"
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="名称、状态、write_outcome 或 MIME"
              data-test="platform-file-query"
            />
            <Button
              type="submit"
              variant="outline"
              data-test="platform-file-query-submit"
            >
              查询
            </Button>
          </form>
          {unknownFiles.length ? (
            <Alert data-test="platform-file-attention">
              <AlertTitle>需要关注的文件状态</AlertTitle>
              <AlertDescription>
                {unknownFiles.length} 个文件处于 deleting 或
                unknown。预算仍以服务端状态为准，不提供绕过状态机的释放/重复上传按钮。
              </AlertDescription>
            </Alert>
          ) : null}
          {fileState === 'success' && files.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
              {query ? '当前搜索没有匹配文件。' : '当前平台暂无配置文件。'}
            </div>
          ) : null}
          {fileState === 'success' && files.length ? (
            <div className="grid gap-2" data-test="platform-file-rows">
              {files.map((file) => {
                const status = fileStatus(file);
                const rowDeleting = deletingFileIds.has(file.file_id);
                const rowDownloading = downloadingFileIds.has(file.file_id);
                const downloadable =
                  file.status === 'active' &&
                  file.write_outcome === 'confirmed';
                return (
                  <article
                    key={file.file_id}
                    className="grid gap-3 rounded-xl border border-border/70 bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                    data-test={`platform-file-row-${file.file_id}`}
                  >
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => void openInspector(file.file_id)}
                      data-test={`platform-file-inspect-${file.file_id}`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="truncate text-sm text-foreground">
                          {file.original_name ?? '未命名文件'}
                        </strong>
                        <StatusBadge
                          label={status.label}
                          tone={status.tone}
                          rawValue={`${file.status}/${file.write_outcome}`}
                        />
                      </span>
                      <span className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {formatBytes(
                            file.actual_size_bytes ?? file.reserved_bytes,
                          )}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{file.mime_type ?? '未知 MIME'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">
                          {file.file_id.slice(0, 8)}…
                        </span>
                      </span>
                      {fileStateNote(file) ? (
                        <span className="mt-2 block text-xs leading-5 text-warning-foreground">
                          {fileStateNote(file)}
                        </span>
                      ) : null}
                    </button>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          !downloadable || rowDownloading || rowDeleting
                        }
                        onClick={() =>
                          void downloadFile({
                            fileId: file.file_id,
                            name: file.original_name ?? 'config-file',
                          })
                        }
                        data-test={`platform-file-download-${file.file_id}`}
                      >
                        {rowDownloading ? '下载中…' : '下载'}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={
                          rowDeleting ||
                          file.status === 'deleted' ||
                          file.status === 'deleting'
                        }
                        onClick={() => openDelete(file)}
                        data-test={`platform-file-delete-${file.file_id}`}
                      >
                        {rowDeleting ? '提交中…' : '受控删除'}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
            <span className="text-xs text-muted-foreground">
              过滤和 cursor 均由当前平台范围的服务端查询处理。
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!cursor}
                onClick={() => goToCursor(null)}
                data-test="platform-file-previous"
              >
                返回首段
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!nextCursor || refreshingFiles}
                onClick={() => goToCursor(nextCursor)}
                data-test="platform-file-next"
              >
                下一页
              </Button>
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/admin/platforms/${encodeURIComponent(platform.platform_id)}/settings`}
          className="text-primary underline-offset-4 hover:underline"
        >
          打开平台设置
        </Link>
        <Link
          href="/admin/deletion-jobs"
          className="text-primary underline-offset-4 hover:underline"
        >
          打开 Global Delete 任务
        </Link>
      </div>

      {deleteIntent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open && deleteState !== 'pending') setDeleteIntent(null);
          }}
          title="受控删除配置文件"
          targetIdentity={deleteIntent.fileId}
          impact={`将请求删除“${deleteIntent.name}”。202 只表示已受理，预算和物理对象要等服务端结算。`}
          reversible={false}
          reasonRequired
          state={deleteState}
          error={deleteError}
          stepUpContent={
            deleteState === 'step_up_required' ? (
              <AdminRecentMfaPanel
                onVerified={() => setDeleteState('confirm_required')}
              />
            ) : null
          }
          onCheckUnknown={
            deleteState === 'unknown_outcome'
              ? () => void checkDeleteUnknown()
              : undefined
          }
          onConfirm={() => void submitDelete()}
        />
      ) : null}

      <ResourceInspector
        open={Boolean(inspectorFileId)}
        onOpenChange={(open) => {
          if (!open) {
            setInspectorFileId(null);
            setInspectedFile(null);
          }
        }}
        title={inspectedFile?.original_name ?? '文件详情'}
        description="只展示受控 metadata，不预览或解析不可信文件内容。"
      >
        {inspectorState === 'loading' ? <AsyncState state="loading" /> : null}
        {inspectorState === 'error' && inspectorError ? (
          <AsyncState
            state="error"
            title={inspectorError.title}
            description={inspectorError.description}
            requestId={inspectorError.requestId}
            technicalDetail={inspectorError.technicalDetail}
            onRetry={() => {
              if (inspectorFileId) void openInspector(inspectorFileId);
            }}
          />
        ) : null}
        {inspectorState === 'success' && inspectedFile ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={fileStatus(inspectedFile).label}
                tone={fileStatus(inspectedFile).tone}
                rawValue={`${inspectedFile.status}/${inspectedFile.write_outcome}`}
              />
              <span className="text-sm text-muted-foreground">
                {inspectedFile.mime_type ?? '未知 MIME'}
              </span>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="File ID" value={inspectedFile.file_id} mono />
              <Detail
                label="Platform Account ID"
                value={inspectedFile.platform_account_id ?? '—'}
                mono
              />
              <Detail
                label="声明/预约大小"
                value={formatBytes(inspectedFile.reserved_bytes)}
              />
              <Detail
                label="实际大小"
                value={formatBytes(inspectedFile.actual_size_bytes)}
              />
              <Detail
                label="创建时间"
                value={formatUtc(inspectedFile.created_at)}
              />
              <Detail
                label="更新时间"
                value={formatUtc(inspectedFile.updated_at)}
              />
              <Detail label="Raw status" value={inspectedFile.status} mono />
              <Detail
                label="Raw write_outcome"
                value={inspectedFile.write_outcome}
                mono
              />
            </dl>
            {fileStateNote(inspectedFile) ? (
              <Alert>
                <AlertTitle>状态说明</AlertTitle>
                <AlertDescription>
                  {fileStateNote(inspectedFile)}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  inspectedFile.status !== 'active' ||
                  inspectedFile.write_outcome !== 'confirmed' ||
                  downloadingFileIds.has(inspectedFile.file_id)
                }
                onClick={() =>
                  void downloadFile({
                    fileId: inspectedFile.file_id,
                    name: inspectedFile.original_name ?? 'config-file',
                  })
                }
                data-test="platform-file-inspector-download"
              >
                {downloadingFileIds.has(inspectedFile.file_id)
                  ? '下载中…'
                  : '下载'}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={
                  inspectedFile.status === 'deleted' ||
                  inspectedFile.status === 'deleting'
                }
                onClick={() => openDelete(inspectedFile)}
                data-test="platform-file-inspector-delete"
              >
                受控删除
              </Button>
            </div>
          </>
        ) : null}
      </ResourceInspector>
    </section>
  );
}

function PolicyNumber({
  id,
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  max?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={1}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        data-test={id}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-muted/20 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 break-all text-foreground ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </dd>
      {mono ? <ResourceId value={value} className="mt-2" /> : null}
    </div>
  );
}
