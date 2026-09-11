'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { ConsumerShell, Icon } from '../../components/consumer-shell';

type ConfigFile = {
  file_id: string;
  status: string;
  size: number;
  content_type: string;
  updated_at: string;
  original_name: string | null;
  write_outcome: string;
};

type FileBudget = {
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

type FileList = {
  items: ConfigFile[];
  next_cursor: string | null;
  budget: FileBudget;
};

type ApiError = { error?: { code?: string } };

const EMPTY_BUDGET: FileBudget = {
  enabled: false,
  max_file_bytes: 0,
  max_files: 0,
  max_total_bytes: 0,
  reserved_bytes: 0,
  reserved_count: 0,
  available_bytes: 0,
  available_count: 0,
  over_quota: false,
};

function csrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const value = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('aisenhub-consumer-csrf='))
    ?.slice('aisenhub-consumer-csrf='.length);
  return value ? decodeURIComponent(value) : null;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const csrf = csrfToken();
  if (csrf) headers.set('x-csrf-token', csrf);
  if (init.body && !(init.body instanceof Blob) && !headers.has('content-type'))
    headers.set('content-type', 'application/json');

  const response = await fetch(`/api/${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const payload = (await response.json().catch(() => null)) as
    | { data?: T }
    | ApiError
    | null;
  if (!response.ok) {
    throw new Error(
      (payload && 'error' in payload ? payload.error?.code : undefined) ??
        'AUTHORIZATION_UNAVAILABLE',
    );
  }
  if (!payload || !('data' in payload) || payload.data === undefined)
    throw new Error('AUTHORIZATION_UNAVAILABLE');
  return payload.data;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusLabel(file: ConfigFile): { label: string; warm: boolean } {
  if (file.status === 'deleting') return { label: '删除中', warm: true };
  if (file.status === 'pending') return { label: '等待上传', warm: true };
  if (file.write_outcome === 'confirmed' && file.status === 'active')
    return { label: '已同步', warm: false };
  return { label: '处理中', warm: true };
}

function friendlyError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'UNAUTHORIZED' || code === 'ACCOUNT_NOT_ACTIVATED')
    return '请先登录并激活工作区后再管理配置文件。';
  if (code === 'QUOTA_EXCEEDED' || code === 'REPLACEMENT_CAPACITY_REQUIRED')
    return '当前配置空间不足，请删除旧文件或调整工作区配额。';
  if (code === 'PAYLOAD_TOO_LARGE' || code === 'UPLOAD_SIZE_MISMATCH')
    return '文件不能超过 1 MiB，请压缩后再上传。';
  return '配置文件服务暂时不可用，请稍后重试。';
}

export default function FilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ConfigFile[]>([]);
  const [budget, setBudget] = useState<FileBudget>(EMPTY_BUDGET);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ConfigFile | null>(null);
  const [deleteAccepted, setDeleteAccepted] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<FileList>('v1/config-files?limit=50');
      setFiles(result.items ?? []);
      setBudget(result.budget ?? EMPTY_BUDGET);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function addFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    if (file.size < 1 || file.size > 1024 * 1024) {
      setError('文件不能为空且不能超过 1 MiB。');
      event.target.value = '';
      return;
    }

    setBusy(true);
    try {
      const intent = await api<{ file_id: string; upload_path: string }>(
        'v1/config-files/upload-intent',
        {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            content_type: file.type || 'application/octet-stream',
            purpose: 'config',
          }),
        },
      );
      const uploaded = await api<ConfigFile>(
        intent.upload_path.replace(/^\/+/u, ''),
        {
          method: 'PUT',
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'idempotency-key': crypto.randomUUID(),
          },
          body: file,
        },
      );
      if (
        uploaded.status !== 'active' ||
        uploaded.write_outcome !== 'confirmed'
      )
        throw new Error('AUTHORIZATION_UNAVAILABLE');
      setNotice(`${file.name} 已上传并完成校验。`);
      await loadFiles();
    } catch (uploadError) {
      setError(friendlyError(uploadError));
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setError('');
    try {
      await api<ConfigFile>(`v1/config-files/${pendingDelete.file_id}`, {
        method: 'DELETE',
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      setDeleteAccepted(true);
      setNotice(`${pendingDelete.original_name ?? '配置文件'} 已受理删除。`);
      await loadFiles();
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(file: ConfigFile) {
    setError('');
    try {
      const response = await fetch(
        `/api/v1/config-files/${file.file_id}/content`,
        { cache: 'no-store', credentials: 'same-origin' },
      );
      if (!response.ok) throw new Error('AUTHORIZATION_UNAVAILABLE');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.original_name ?? 'config-file';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(friendlyError(downloadError));
    }
  }

  const usageText = budget.enabled
    ? `${formatBytes(budget.reserved_bytes)} / ${formatBytes(budget.max_total_bytes)} 已使用`
    : '工作区配额待配置';

  return (
    <ConsumerShell
      title="配置文件"
      description="配置文件通过同源服务端边界上传、下载和异步删除，浏览器不接触 Storage 凭据。"
      actions={
        <>
          <input
            ref={fileInputRef}
            className="consumer-visually-hidden"
            type="file"
            accept=".json,.yaml,.yml,.conf,.env,.txt"
            onChange={(event) => void addFile(event)}
            disabled={busy || loading}
          />
          <button
            className="consumer-button consumer-button-primary"
            type="button"
            disabled={busy || loading || !budget.enabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <span>{busy ? '处理中…' : '上传配置'}</span>
            <Icon name="arrow" size={17} />
          </button>
        </>
      }
    >
      <section className="consumer-files-toolbar" aria-label="配置文件概览">
        <div>
          <p className="consumer-overline">工作区配额</p>
          <h2>当前使用情况</h2>
        </div>
        <div className="consumer-files-toolbar-meta">
          <span>{usageText}</span>
          <span
            className={`consumer-status${budget.over_quota ? ' is-warm' : ''}`}
          >
            {budget.enabled ? `${budget.available_count} 个可用` : '待配置'}
          </span>
        </div>
      </section>

      {error ? (
        <div className="consumer-note-panel" role="alert">
          <div>
            <strong>配置文件暂时不可用</strong>
            <p>{error}</p>
          </div>
          <button
            className="consumer-button consumer-button-secondary consumer-button-compact"
            type="button"
            onClick={() => void loadFiles()}
          >
            重试
          </button>
        </div>
      ) : null}

      <section
        className="consumer-panel consumer-files-panel"
        aria-labelledby="file-list-title"
      >
        <div className="consumer-panel-heading">
          <div>
            <p className="consumer-overline">全部配置</p>
            <h2 id="file-list-title">配置列表</h2>
          </div>
          <span className="consumer-form-message" role="status">
            {loading ? '加载中…' : notice}
          </span>
        </div>
        <div
          className="consumer-table-head consumer-file-table-head"
          aria-hidden="true"
        >
          <span>文件名称</span>
          <span>更新时间</span>
          <span>状态</span>
          <span />
        </div>
        <div className="consumer-file-list">
          {files.map((file) => {
            const status = statusLabel(file);
            return (
              <div
                className="consumer-row consumer-file-row"
                key={file.file_id}
              >
                <div className="consumer-file-primary">
                  <span className="consumer-file-icon">
                    <Icon name="file" size={18} />
                  </span>
                  <span>
                    <strong>{file.original_name ?? '未命名配置'}</strong>
                    <small>
                      {file.content_type} · {formatBytes(file.size)}
                    </small>
                  </span>
                </div>
                <span className="consumer-file-updated">
                  {formatDate(file.updated_at)}
                </span>
                <span
                  className={`consumer-status${status.warm ? ' is-warm' : ''}`}
                >
                  {status.label}
                </span>
                <div className="consumer-file-actions">
                  <button
                    className="consumer-small-button"
                    type="button"
                    disabled={file.status !== 'active'}
                    onClick={() => void downloadFile(file)}
                  >
                    下载
                  </button>
                  <button
                    className="consumer-small-button consumer-small-button-quiet"
                    type="button"
                    disabled={busy || file.status === 'deleting'}
                    onClick={() => {
                      setPendingDelete(file);
                      setDeleteAccepted(false);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && files.length === 0 ? (
            <div className="consumer-empty-state">
              <span className="consumer-file-icon">
                <Icon name="file" size={20} />
              </span>
              <strong>还没有配置文件</strong>
              <span>
                {budget.enabled
                  ? '上传第一个配置文件，它会出现在这里。'
                  : '工作区配额配置完成后即可上传。'}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {pendingDelete ? (
        <div
          className="consumer-modal-backdrop"
          data-test="confirm-action-dialog"
        >
          <div className="consumer-modal" role="dialog" aria-modal="true">
            <p className="consumer-overline">删除配置文件</p>
            <h2>确认删除{pendingDelete.original_name ?? '该文件'}？</h2>
            <p>删除请求会进入后台处理，正在删除的文件不会被重新授权下载。</p>
            <div className="consumer-form-footer">
              <button
                className="consumer-button consumer-button-secondary"
                type="button"
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                className="consumer-button consumer-button-primary"
                type="button"
                data-test="confirm-action-submit"
                disabled={busy || deleteAccepted}
                onClick={() => void confirmDelete()}
              >
                {deleteAccepted ? '已受理' : busy ? '提交中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConsumerShell>
  );
}
