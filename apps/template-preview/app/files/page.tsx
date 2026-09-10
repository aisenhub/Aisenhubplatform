'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { SessionRetryRequiredError } from '@kit/account-auth-nextjs/browser';
import { AsyncState } from '@kit/ui/async-state';
import { Button } from '@kit/ui/button';
import { ConfirmActionDialog } from '@kit/ui/confirm-action-dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceId } from '@kit/ui/resource-id';
import { ResourceInspector } from '@kit/ui/resource-inspector';
import { StatusBadge, type StatusTone } from '@kit/ui/status-badge';

import {
  ConsumerLogoutButton,
  ConsumerShell,
} from '../../components/consumer-shell';
import {
  ConsumerEmptyState,
  ConsumerNotice,
  ConsumerRemoteStateView,
  ConsumerStatus,
  errorFromException,
  errorFromResponse,
  type ConsumerError,
  type ConsumerRemoteState,
} from '../../components/consumer-state';
import {
  consumerAuthSession,
  useConsumerSessionSnapshot,
} from '../_lib/auth-session';

type ConfigFile = {
  file_id: string;
  original_name: string | null;
  status: string;
  write_outcome: string;
  size: number;
  reserved_bytes: number;
  reserved_count: number;
  actual_size_bytes: number | null;
  content_type: string;
  created_at: string;
  updated_at: string;
  cancel_requested_at: string | null;
};

type Budget = {
  enabled: boolean;
  max_file_bytes: number;
  max_files: number;
  max_total_bytes: number;
  reserved_bytes: number;
  reserved_count: number;
  available_bytes: number;
  available_count: number;
  over_quota: boolean;
};

type FilesPayload = { items?: ConfigFile[]; budget?: Budget };
type DeleteIntent = { file: ConfigFile; idempotencyKey: string };

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function fileStatus(file: ConfigFile): { label: string; tone: StatusTone } {
  if (file.write_outcome === 'unknown')
    return { label: '结果待确认', tone: 'unknown' };
  if (file.cancel_requested_at) return { label: '已请求删除', tone: 'warning' };
  switch (file.status) {
    case 'active':
      return { label: '可用', tone: 'success' };
    case 'receiving':
      return { label: '接收中', tone: 'info' };
    case 'storing':
      return { label: '保存中', tone: 'info' };
    case 'deleting':
      return { label: '删除中', tone: 'warning' };
    case 'deleted':
      return { label: '已删除', tone: 'neutral' };
    case 'failed':
      return { label: '处理失败', tone: 'danger' };
    case 'expired':
      return { label: '已过期', tone: 'neutral' };
    default:
      return { label: '状态待确认', tone: 'unknown' };
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function FilesPage() {
  const sessionSnapshot = useConsumerSessionSnapshot();
  const [files, setFiles] = useState<ConfigFile[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loadState, setLoadState] = useState<ConsumerRemoteState>('loading');
  const [loadError, setLoadError] = useState<ConsumerError | null>(null);
  const [refreshError, setRefreshError] = useState<ConsumerError | null>(null);
  const [selectedReplace, setSelectedReplace] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadError, setUploadError] = useState<ConsumerError | null>(null);
  const [rowPending, setRowPending] = useState<
    Record<string, 'download' | 'delete'>
  >({});
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent | null>(null);
  const [deleteState, setDeleteState] =
    useState<MutationState>('confirm_required');
  const [deleteError, setDeleteError] = useState<ConsumerError | null>(null);
  const [inspectorFileId, setInspectorFileId] = useState<string | null>(null);
  const [inspectedFile, setInspectedFile] = useState<ConfigFile | null>(null);
  const [inspectorState, setInspectorState] =
    useState<ConsumerRemoteState>('loading');
  const [inspectorError, setInspectorError] = useState<ConsumerError | null>(
    null,
  );
  const generationRef = useRef(0);

  const load = useCallback(async (background = false) => {
    const generation = ++generationRef.current;
    const epoch = consumerAuthSession.getEpoch();
    if (background) setRefreshError(null);
    else {
      setLoadState('loading');
      setLoadError(null);
    }
    try {
      const response = await consumerAuthSession.request(
        '/api/v1/config-files?limit=20',
        { cache: 'no-store' },
      );
      const payload = (
        response.ok ? await response.json().catch(() => null) : null
      ) as {
        data?: FilesPayload;
      } | null;
      if (
        generation !== generationRef.current ||
        !consumerAuthSession.isCurrentEpoch(epoch)
      )
        return;
      if (
        !response.ok ||
        !payload?.data ||
        !Array.isArray(payload.data.items)
      ) {
        const nextError = await errorFromResponse(response, '文件');
        if (background) setRefreshError(nextError);
        else {
          setLoadError(nextError);
          setLoadState(nextError.title === '需要登录' ? 'access' : 'error');
        }
        return;
      }
      setFiles(payload.data.items);
      setBudget(payload.data.budget ?? null);
      setLoadState('success');
      setLoadError(null);
      setRefreshError(null);
    } catch (caught) {
      if (
        generation !== generationRef.current ||
        !consumerAuthSession.isCurrentEpoch(epoch)
      )
        return;
      const nextError = errorFromException('文件', caught);
      if (background) setRefreshError(nextError);
      else {
        setLoadError(nextError);
        setLoadState('error');
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      !sessionSnapshot.resolved ||
      !['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    )
      return;
    setFiles([]);
    setBudget(null);
    setSelectedReplace('');
    setSelectedFile(null);
    setDeleteIntent(null);
    setInspectorFileId(null);
    setLoadState('access');
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  async function upload() {
    const file = selectedFile;
    if (!file || uploadPending) return;
    setUploadPending(true);
    setUploadError(null);
    try {
      const intentResponse = await consumerAuthSession.request(
        '/api/v1/config-files/upload-intent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            content_type: file.type || 'application/octet-stream',
            purpose: 'config',
            replaces_file_id: selectedReplace || null,
          }),
        },
        { replay: 'never' },
      );
      const intentPayload = (
        intentResponse.ok ? await intentResponse.json().catch(() => null) : null
      ) as {
        data?: { upload_path?: string };
      } | null;
      if (!intentResponse.ok || !intentPayload?.data?.upload_path) {
        setUploadError(await errorFromResponse(intentResponse, '上传预约'));
        return;
      }
      const uploadResponse = await consumerAuthSession.request(
        `/api${intentPayload.data.upload_path}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: file,
        },
        { replay: 'never' },
      );
      if (!uploadResponse.ok) {
        setUploadError({
          title: '上传结果待确认',
          description: '字节流没有完成。请先刷新文件状态，不会自动重发字节流。',
          requestId: uploadResponse.headers.get('x-request-id'),
          technicalDetail: null,
        });
        return;
      }
      setSelectedFile(null);
      setSelectedReplace('');
      await load(true);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setUploadError({
          title: '会话已恢复，请重新提交',
          description: '为避免重复上传，字节流没有自动重放；请先刷新状态。',
          requestId: null,
          technicalDetail: null,
        });
      } else {
        setUploadError({
          title: '上传结果待确认',
          description: '网络在字节流完成前中断。请先刷新状态，不要立即重传。',
          requestId: null,
          technicalDetail: null,
        });
      }
    } finally {
      setUploadPending(false);
    }
  }

  function openDelete(file: ConfigFile) {
    setDeleteIntent({ file, idempotencyKey: crypto.randomUUID() });
    setDeleteState('confirm_required');
    setDeleteError(null);
  }

  function closeDelete() {
    if (deleteState === 'pending') return;
    setDeleteIntent(null);
    setDeleteState('confirm_required');
    setDeleteError(null);
  }

  async function submitDelete() {
    if (!deleteIntent) return;
    setDeleteState('pending');
    setDeleteError(null);
    setRowPending((current) => ({
      ...current,
      [deleteIntent.file.file_id]: 'delete',
    }));
    try {
      const response = await consumerAuthSession.request(
        `/api/v1/config-files/${encodeURIComponent(deleteIntent.file.file_id)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': deleteIntent.idempotencyKey,
          },
          body: '{}',
        },
        { replay: 'never' },
      );
      if (!response.ok) {
        setDeleteState('failure');
        setDeleteError(await errorFromResponse(response, '删除请求'));
        return;
      }
      setDeleteState(response.status === 202 ? 'accepted' : 'success');
      await load(true);
    } catch (caught) {
      if (caught instanceof SessionRetryRequiredError) {
        setDeleteState('failure');
        setDeleteError({
          title: '会话已恢复，请重新提交',
          description: '为避免重复提交，本次删除请求没有自动重放。',
          requestId: null,
          technicalDetail: null,
        });
      } else {
        setDeleteState('unknown_outcome');
        setDeleteError({
          title: '删除结果待确认',
          description:
            '网络在服务端响应前中断。请先检查文件状态，不要立即重新提交。',
          requestId: null,
          technicalDetail: null,
        });
      }
    } finally {
      setRowPending((current) => {
        const next = { ...current };
        if (deleteIntent) delete next[deleteIntent.file.file_id];
        return next;
      });
    }
  }

  async function checkDeleteUnknown() {
    if (!deleteIntent) return;
    try {
      const response = await consumerAuthSession.request(
        `/api/v1/config-files/${encodeURIComponent(deleteIntent.file.file_id)}`,
        { cache: 'no-store' },
      );
      const payload = (
        response.ok ? await response.json().catch(() => null) : null
      ) as {
        data?: ConfigFile;
      } | null;
      if (!response.ok || !payload?.data) {
        setDeleteError(await errorFromResponse(response, '文件状态检查'));
        return;
      }
      setFiles((current) =>
        current.map((file) =>
          file.file_id === payload.data!.file_id ? payload.data! : file,
        ),
      );
      const status = fileStatus(payload.data);
      if (payload.data.status === 'deleted') {
        setDeleteState('success');
        setDeleteError({
          title: '删除状态已确认',
          description:
            '服务端已确认文件删除完成；预算是否释放仍以最新预算为准。',
          requestId: null,
          technicalDetail: null,
        });
      } else if (payload.data.status === 'deleting') {
        setDeleteState('accepted');
        setDeleteError({
          title: '删除请求已受理',
          description: `文件当前为“${status.label}”；预算在完成前仍可能占用。`,
          requestId: null,
          technicalDetail: null,
        });
      } else {
        setDeleteError({
          title: '状态仍待确认',
          description: '服务端状态还不能证明原删除请求结果；页面不会重复提交。',
          requestId: null,
          technicalDetail: payload.data.status,
        });
      }
      await load(true);
    } catch (caught) {
      setDeleteError(errorFromException('文件状态检查', caught));
    }
  }

  async function download(file: ConfigFile) {
    if (rowPending[file.file_id]) return;
    setRowPending((current) => ({ ...current, [file.file_id]: 'download' }));
    try {
      const response = await consumerAuthSession.request(
        `/api/v1/config-files/${encodeURIComponent(file.file_id)}/content`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        setUploadError(await errorFromResponse(response, '下载'));
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = file.original_name ?? 'config-file';
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (caught) {
      setUploadError(errorFromException('下载', caught));
    } finally {
      setRowPending((current) => {
        const next = { ...current };
        delete next[file.file_id];
        return next;
      });
    }
  }

  async function openInspector(fileId: string) {
    setInspectorFileId(fileId);
    setInspectedFile(null);
    setInspectorError(null);
    setInspectorState('loading');
    try {
      const response = await consumerAuthSession.request(
        `/api/v1/config-files/${encodeURIComponent(fileId)}`,
        { cache: 'no-store' },
      );
      const payload = (
        response.ok ? await response.json().catch(() => null) : null
      ) as {
        data?: ConfigFile;
      } | null;
      if (!response.ok || !payload?.data || payload.data.file_id !== fileId) {
        setInspectorError(await errorFromResponse(response, '文件详情'));
        setInspectorState(response.status === 401 ? 'access' : 'error');
        return;
      }
      setInspectedFile(payload.data);
      setInspectorState('success');
    } catch (caught) {
      setInspectorError(errorFromException('文件详情', caught));
      setInspectorState('error');
    }
  }

  const activeFiles = files.filter(
    (file) => file.status === 'active' && file.write_outcome === 'confirmed',
  );

  return (
    <ConsumerShell
      title="配置文件"
      description="预算和文件状态分别表达。上传字节流不会自动重传，删除接受后预算仍可能占用，最终以服务端状态为准。"
      headerActions={<ConsumerLogoutButton />}
    >
      {refreshError ? (
        <ConsumerNotice
          title="文件数据可能已过期"
          description={refreshError.description}
          tone="warning"
          requestId={refreshError.requestId}
          technicalDetail={refreshError.technicalDetail}
          action={<Button onClick={() => void load(true)}>刷新状态</Button>}
        />
      ) : null}
      {uploadError ? (
        <ConsumerNotice
          title={uploadError.title}
          description={uploadError.description}
          tone="warning"
          requestId={uploadError.requestId}
          technicalDetail={uploadError.technicalDetail}
        />
      ) : null}
      {loadState === 'error' || loadState === 'access' ? (
        <ConsumerRemoteStateView
          state={loadState}
          error={loadError}
          onRetry={() => void load()}
        />
      ) : null}
      {loadState === 'loading' ? (
        <ConsumerRemoteStateView state="loading" />
      ) : null}
      {loadState === 'success' ? (
        <>
          {budget ? (
            <section className="consumer-card" data-test="consumer-budget">
              <div className="consumer-card-header">
                <div>
                  <h2>当前使用情况</h2>
                </div>
                <StatusBadge
                  label={budget.enabled ? '策略已启用' : '策略已关闭'}
                  tone={budget.enabled ? 'success' : 'warning'}
                  rawValue={budget.enabled ? 'enabled' : 'disabled'}
                />
              </div>
              <div className="consumer-stat-grid">
                <div className="consumer-stat">
                  <span className="consumer-stat-label">空间</span>
                  <span className="consumer-stat-value text-base">
                    {formatBytes(budget.reserved_bytes)} /{' '}
                    {formatBytes(budget.max_total_bytes)}
                  </span>
                  <span className="consumer-help">
                    可用 {formatBytes(budget.available_bytes)}
                  </span>
                </div>
                <div className="consumer-stat">
                  <span className="consumer-stat-label">文件数</span>
                  <span className="consumer-stat-value text-base">
                    {budget.reserved_count} / {budget.max_files}
                  </span>
                  <span className="consumer-help">
                    可用 {budget.available_count} 个
                  </span>
                </div>
                <div className="consumer-stat">
                  <span className="consumer-stat-label">单文件上限</span>
                  <span className="consumer-stat-value text-base">
                    {formatBytes(budget.max_file_bytes)}
                  </span>
                  <span className="consumer-help">服务端策略</span>
                </div>
              </div>
              {budget.over_quota ? (
                <ConsumerNotice
                  title="当前超出策略额度"
                  description="已有文件保留；新上传和 Replace 会被服务端拒绝。删除完成前，预算不会提前释放。"
                  tone="warning"
                />
              ) : null}
            </section>
          ) : null}

          <section className="consumer-card" data-test="consumer-upload">
            <div>
              <h2>上传或 Replace</h2>
              <p className="consumer-card-description">
                先创建 upload
                intent，再提交有界字节流；两步失败时都不会自动重放。
              </p>
            </div>
            <div className="consumer-form">
              <div className="consumer-field">
                <Label htmlFor="config-file">配置文件</Label>
                <Input
                  id="config-file"
                  type="file"
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] ?? null)
                  }
                />
              </div>
              <div className="consumer-field">
                <Label htmlFor="replace-file">Replace 目标（可选）</Label>
                <select
                  id="replace-file"
                  value={selectedReplace}
                  onChange={(event) => setSelectedReplace(event.target.value)}
                >
                  <option value="">新文件</option>
                  {activeFiles.map((file) => (
                    <option key={file.file_id} value={file.file_id}>
                      {file.original_name ?? file.file_id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="consumer-actions">
                <Button
                  type="button"
                  onClick={() => void upload()}
                  disabled={!selectedFile || uploadPending}
                >
                  {uploadPending ? '上传中…' : '预约并上传'}
                </Button>
                {uploadPending ? (
                  <ConsumerStatus busy>
                    正在预约并上传；断线不会自动重传。
                  </ConsumerStatus>
                ) : null}
              </div>
            </div>
          </section>

          <section className="consumer-card" data-test="consumer-files">
            <div className="consumer-card-header">
              <div>
                <h2>文件状态</h2>
                <p className="consumer-card-description">
                  点击“查看详情”读取单个文件的权威状态。
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void load(true)}
              >
                刷新状态
              </Button>
            </div>
            {files.length === 0 ? (
              <ConsumerEmptyState
                title="还没有配置文件"
                description="上传第一个文件后，它会出现在这里。"
              />
            ) : (
              <div className="consumer-data-list">
                {files.map((file) => {
                  const status = fileStatus(file);
                  const pending = rowPending[file.file_id];
                  return (
                    <article key={file.file_id} className="consumer-row">
                      <div className="min-w-0">
                        <div className="consumer-row-title">
                          <span className="break-all">
                            {file.original_name ?? '未命名文件'}
                          </span>
                          <StatusBadge
                            label={status.label}
                            tone={status.tone}
                            rawValue={
                              file.write_outcome === 'unknown'
                                ? 'unknown'
                                : file.status
                            }
                          />
                        </div>
                        <span className="consumer-row-meta">
                          {formatBytes(file.size)} · {file.content_type} ·
                          预算占用 {formatBytes(file.reserved_bytes)}
                        </span>
                        <span className="consumer-row-meta">
                          更新时间 {formatDate(file.updated_at)} · ID{' '}
                          <span className="consumer-code">{file.file_id}</span>
                        </span>
                        {file.write_outcome === 'unknown' ||
                        file.status === 'deleting' ? (
                          <span className="consumer-row-meta text-warning-foreground">
                            结果或删除仍在确认中；预算不会被页面提前释放。
                          </span>
                        ) : null}
                      </div>
                      <div className="consumer-row-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openInspector(file.file_id)}
                        >
                          查看详情
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void download(file)}
                          disabled={
                            Boolean(pending) ||
                            file.status !== 'active' ||
                            file.write_outcome !== 'confirmed'
                          }
                        >
                          {pending === 'download' ? '下载中…' : '下载'}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => openDelete(file)}
                          disabled={
                            Boolean(pending) || file.status === 'deleted'
                          }
                        >
                          {pending === 'delete' ? '提交中…' : '删除'}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      {deleteIntent ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open) closeDelete();
          }}
          title="删除配置文件"
          targetIdentity={deleteIntent.file.file_id}
          impact="删除是异步操作；文件进入 deleting 后预算仍可能占用，页面不会提前显示为已释放。"
          reversible={false}
          state={deleteState}
          error={deleteError}
          onCheckUnknown={
            deleteState === 'unknown_outcome' ? checkDeleteUnknown : undefined
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
        description="只显示服务端返回的文件元数据和状态；不在浏览器直接预览二进制。"
      >
        {inspectorState === 'loading' ? <AsyncState state="loading" /> : null}
        {inspectorState === 'error' || inspectorState === 'access' ? (
          <ConsumerRemoteStateView
            state={inspectorState}
            error={inspectorError}
            onRetry={() =>
              inspectorFileId && void openInspector(inspectorFileId)
            }
          />
        ) : null}
        {inspectorState === 'success' && inspectedFile ? (
          <>
            <div className="consumer-actions">
              <StatusBadge
                label={fileStatus(inspectedFile).label}
                tone={fileStatus(inspectedFile).tone}
                rawValue={inspectedFile.status}
              />
              <ResourceId value={inspectedFile.file_id} />
            </div>
            <dl className="consumer-detail-grid">
              <Detail label="状态" value={inspectedFile.status} />
              <Detail label="写入结果" value={inspectedFile.write_outcome} />
              <Detail
                label="文件大小"
                value={formatBytes(inspectedFile.size)}
              />
              <Detail
                label="实际大小"
                value={formatBytes(inspectedFile.actual_size_bytes)}
              />
              <Detail label="内容类型" value={inspectedFile.content_type} />
              <Detail
                label="预算占用"
                value={formatBytes(inspectedFile.reserved_bytes)}
              />
              <Detail
                label="创建时间"
                value={formatDate(inspectedFile.created_at)}
              />
              <Detail
                label="更新时间"
                value={formatDate(inspectedFile.updated_at)}
              />
            </dl>
            <div className="consumer-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => void download(inspectedFile)}
                disabled={
                  inspectedFile.status !== 'active' ||
                  inspectedFile.write_outcome !== 'confirmed'
                }
              >
                下载
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => openDelete(inspectedFile)}
                disabled={inspectedFile.status === 'deleted'}
              >
                删除
              </Button>
            </div>
          </>
        ) : null}
      </ResourceInspector>
    </ConsumerShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="consumer-stat">
      <dt className="consumer-detail-label">{label}</dt>
      <dd className="mt-1 break-all text-sm text-foreground">{value}</dd>
    </div>
  );
}
