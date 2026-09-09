'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  consumerAuthSession,
  responseErrorCode,
  sessionErrorMessage,
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

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KiB`;
}

function statusLabel(file: ConfigFile): string {
  if (file.write_outcome === 'unknown') return '未知写入结果';
  if (file.cancel_requested_at) return '已请求取消';
  return file.status;
}

export default function FilesPage() {
  const sessionSnapshot = useConsumerSessionSnapshot();
  const [files, setFiles] = useState<ConfigFile[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [selectedReplace, setSelectedReplace] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState('正在读取配置文件…');
  const [busy, setBusy] = useState(false);

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
    setStatus('会话已结束，文件与预算数据已清理。');
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  const load = useCallback(async () => {
    const epoch = consumerAuthSession.getEpoch();
    let response: Response;
    try {
      response = await consumerAuthSession.request(
        '/api/v1/config-files?limit=20',
      );
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      return;
    }
    if (!response.ok) {
      const code = await responseErrorCode(response);
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(`文件状态读取失败：${code}`);
      return;
    }
    const payload = (await response.json()) as {
      data?: { items?: ConfigFile[]; budget?: Budget };
    };
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    setFiles(payload.data?.items ?? []);
    setBudget(payload.data?.budget ?? null);
    setStatus('状态已从 Account API 刷新；页面不会自动重试未完成上传。');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload() {
    if (!selectedFile) return;
    const epoch = consumerAuthSession.getEpoch();
    setBusy(true);
    setStatus('正在预约并上传…');
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
            name: selectedFile.name,
            size: selectedFile.size,
            content_type: selectedFile.type || 'application/octet-stream',
            purpose: 'config',
            replaces_file_id: selectedReplace || null,
          }),
        },
        { replay: 'never' },
      );
      const intent = (await intentResponse.json().catch(() => null)) as {
        data?: { upload_path?: string };
      } | null;
      if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
      if (!intentResponse.ok || !intent?.data?.upload_path) {
        setStatus('预约失败：配额不足、策略关闭或文件输入不符合限制。');
        return;
      }
      const uploadResponse = await consumerAuthSession.request(
        `/api${intent.data.upload_path}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: selectedFile,
        },
        { replay: 'never' },
      );
      if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
      setStatus(
        uploadResponse.ok
          ? '上传已结算；请以文件状态和预算占用为准。'
          : '上传未完成，请刷新状态后按状态处理，不会自动重发字节流。',
      );
      if (uploadResponse.ok) {
        setSelectedFile(null);
        setSelectedReplace('');
        await load();
      }
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(fileId: string) {
    const epoch = consumerAuthSession.getEpoch();
    setBusy(true);
    let response: Response;
    try {
      response = await consumerAuthSession.request(
        `/api/v1/config-files/${fileId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: '{}',
        },
        { replay: 'never' },
      );
    } catch (error) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus(sessionErrorMessage(error));
      setBusy(false);
      return;
    }
    if (!consumerAuthSession.isCurrentEpoch(epoch)) {
      setBusy(false);
      return;
    }
    setStatus(
      response.ok
        ? '删除请求已接受；deleting 期间预算仍占用，确认完成前不会显示为已释放。'
        : '删除请求被拒绝，请刷新状态。',
    );
    await load();
    setBusy(false);
  }

  async function download(file: ConfigFile) {
    const epoch = consumerAuthSession.getEpoch();
    let response: Response;
    try {
      response = await consumerAuthSession.request(
        `/api/v1/config-files/${file.file_id}/content`,
      );
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      return;
    }
    if (!response.ok) {
      if (consumerAuthSession.isCurrentEpoch(epoch))
        setStatus('下载失败：文件可能正在删除、账户已暂停或对象需要恢复。');
      return;
    }
    const blob = await response.blob();
    if (!consumerAuthSession.isCurrentEpoch(epoch)) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.original_name ?? 'config-file';
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('下载流已完成；这不代表客户端已保存文件。');
  }

  return (
    <main className="shell wide-shell">
      <p className="eyebrow">Template Preview · M4</p>
      <h1>Configuration files</h1>
      <p className="muted">
        文件只经同源 BFF 进入 Account API；页面展示真实预算和状态，不直接访问
        Storage。
      </p>
      <p className="muted" role="status">
        {status}
      </p>
      {budget ? (
        <section className="panel">
          <h2>Budget status</h2>
          <div className="data-list">
            <div>
              <strong>字节</strong>
              <span>
                {formatBytes(budget.reserved_bytes)} 已占用 ·{' '}
                {formatBytes(budget.available_bytes)} 可用
              </span>
            </div>
            <div>
              <strong>文件数</strong>
              <span>
                {budget.reserved_count} 已占用 · {budget.available_count} 可用
              </span>
            </div>
            <div>
              <strong>策略</strong>
              <span>
                {budget.enabled ? 'enabled' : 'disabled'} · 单文件上限{' '}
                {formatBytes(budget.max_file_bytes)}
              </span>
            </div>
          </div>
          {budget.over_quota ? (
            <p className="warning">
              当前策略低于已占用量；已有文件保留，新上传和 Replace 会被拒绝。
            </p>
          ) : null}
        </section>
      ) : null}
      <section className="panel stack-form">
        <h2>上传或 Replace</h2>
        <label htmlFor="config-file">配置文件</label>
        <input
          id="config-file"
          type="file"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        />
        <label htmlFor="replace-file">Replace 目标（可选）</label>
        <select
          id="replace-file"
          value={selectedReplace}
          onChange={(event) => setSelectedReplace(event.target.value)}
        >
          <option value="">新文件</option>
          {files
            .filter((file) => file.status === 'active')
            .map((file) => (
              <option key={file.file_id} value={file.file_id}>
                {file.original_name ?? file.file_id}
              </option>
            ))}
        </select>
        <button
          type="button"
          disabled={!selectedFile || busy}
          onClick={() => void upload()}
        >
          预约并上传
        </button>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>File states</h2>
          <button type="button" onClick={() => void load()}>
            刷新状态
          </button>
        </div>
        {files.length === 0 ? (
          <p className="muted">暂无配置文件。</p>
        ) : (
          <div className="data-list">
            {files.map((file) => (
              <div key={file.file_id} className="file-row">
                <div>
                  <strong>{file.original_name ?? 'unnamed file'}</strong>
                  <small>
                    {file.file_id} · {formatBytes(file.size)} ·{' '}
                    {file.content_type}
                  </small>
                </div>
                <div className="file-actions">
                  <span>
                    {statusLabel(file)} · reserved{' '}
                    {formatBytes(file.reserved_bytes)}
                  </span>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      file.status !== 'active' ||
                      file.write_outcome !== 'confirmed'
                    }
                    onClick={() => void download(file)}
                  >
                    下载
                  </button>
                  <button
                    type="button"
                    disabled={busy || file.status === 'deleted'}
                    onClick={() => void remove(file.file_id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <nav className="actions" aria-label="File navigation">
        <a className="link" href="/account">
          返回账户设置
        </a>
        <a className="link" href="/">
          返回首页
        </a>
      </nav>
    </main>
  );
}
