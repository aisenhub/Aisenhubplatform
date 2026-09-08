'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AdminNav } from '../components/admin-nav';

type Platform = { platform_id: string; code: string; name: string };
type Policy = {
  enabled: boolean;
  max_file_bytes: number;
  max_files: number;
  max_total_bytes: number;
};
type ConfigFile = {
  file_id: string;
  platform_id?: string;
  original_name: string | null;
  status: string;
  write_outcome: string;
  reserved_bytes: number;
  actual_size_bytes: number | null;
  content_type: string;
};

function csrfToken(): string {
  return (
    document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('aisenhub-csrf='))
      ?.split('=')[1] ?? ''
  );
}

function mutationHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Origin: window.location.origin,
    'X-CSRF-Token': csrfToken(),
  };
}

function formatBytes(value: number): string {
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`;
}

export default function AdminFilesPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [platformId, setPlatformId] = useState('');
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [files, setFiles] = useState<ConfigFile[]>([]);
  const [fileFilter, setFileFilter] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState('正在读取文件运维数据…');

  const load = useCallback(
    async (cursor?: string) => {
      const platformResponse = await fetch(
        '/api/v1/admin/api/v1/platforms?limit=100',
        { cache: 'no-store' },
      );
      if (!platformResponse.ok) {
        setStatus('平台读取失败，请确认 AAL2 管理员会话。');
        return;
      }
      const platformBody = (await platformResponse.json()) as {
        data?: Platform[];
      };
      const nextPlatforms = platformBody.data ?? [];
      setPlatforms(nextPlatforms);
      const selected = platformId || nextPlatforms[0]?.platform_id || '';
      setPlatformId(selected);
      if (!selected) {
        setStatus('暂无平台。');
        return;
      }
      const [policyResponse, filesResponse] = await Promise.all([
        fetch(`/api/v1/admin/api/v1/platforms/${selected}/file-policy`, {
          cache: 'no-store',
        }),
        fetch(
          `/api/v1/admin/api/v1/config-files?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          {
            cache: 'no-store',
          },
        ),
      ]);
      if (!policyResponse.ok || !filesResponse.ok) {
        setStatus('文件策略或状态读取失败。');
        return;
      }
      setPolicy(
        ((await policyResponse.json()) as { data?: Policy }).data ?? null,
      );
      const fileBody = (await filesResponse.json()) as {
        data?: ConfigFile[];
        next_cursor?: string | null;
      };
      setFiles(
        (fileBody.data ?? []).filter(
          (file) => !file.platform_id || file.platform_id === selected,
        ),
      );
      setNextCursor(fileBody.next_cursor ?? null);
      setStatus('文件策略和状态已从 Admin API 刷新。');
    },
    [platformId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visibleFiles = files.filter((file) =>
    `${file.original_name ?? ''} ${file.status} ${file.write_outcome}`
      .toLowerCase()
      .includes(fileFilter.trim().toLowerCase()),
  );

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy || !platformId) return;
    const response = await fetch(
      `/api/v1/admin/api/v1/platforms/${platformId}/file-policy`,
      {
        method: 'PATCH',
        headers: mutationHeaders(),
        body: JSON.stringify(policy),
      },
    );
    setStatus(
      response.ok
        ? '策略已更新；低于当前占用时不会自动删除文件。'
        : '策略更新失败，请确认近期 MFA proof。',
    );
    if (response.ok) await load();
  }

  async function download(fileId: string, name: string | null) {
    const response = await fetch(
      `/api/v1/admin/api/v1/config-files/${fileId}/content`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      setStatus('下载失败：文件不可下载或近期 MFA proof 已失效。');
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name ?? 'config-file';
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Admin 下载流已完成；不代表客户端已保存。');
  }

  async function remove(fileId: string) {
    const response = await fetch(
      `/api/v1/admin/api/v1/config-files/${fileId}`,
      {
        method: 'DELETE',
        headers: {
          ...mutationHeaders(),
          'Idempotency-Key': crypto.randomUUID(),
        },
      },
    );
    setStatus(
      response.ok
        ? '删除请求已受控提交；202 不代表对象已从 Storage 删除。'
        : '删除请求失败，请确认近期 MFA proof 和文件状态。',
    );
    if (response.ok) await load();
  }

  return (
    <main className="shell wide-shell">
      <AdminNav />
      <p className="eyebrow">Aisenhub Admin · M4</p>
      <h1>File operations</h1>
      <p className="muted">
        策略、状态和下载均经 Admin API；页面不计算配额，也不直连
        Storage。下载需要近期 MFA proof。
      </p>
      <p className="muted" role="status">
        {status}
      </p>
      <section className="panel stack-form">
        <label htmlFor="platform">平台范围</label>
        <select
          id="platform"
          value={platformId}
          onChange={(event) => setPlatformId(event.target.value)}
        >
          {platforms.map((platform) => (
            <option key={platform.platform_id} value={platform.platform_id}>
              {platform.code} · {platform.name}
            </option>
          ))}
        </select>
        {policy ? (
          <form onSubmit={savePolicy} className="grid-two">
            <label>
              <input
                type="checkbox"
                checked={policy.enabled}
                onChange={(event) =>
                  setPolicy({ ...policy, enabled: event.target.checked })
                }
              />{' '}
              策略启用
            </label>
            <label>
              单文件字节
              <input
                type="number"
                min={1}
                max={1048576}
                value={policy.max_file_bytes}
                onChange={(event) =>
                  setPolicy({
                    ...policy,
                    max_file_bytes: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              最大文件数
              <input
                type="number"
                min={1}
                value={policy.max_files}
                onChange={(event) =>
                  setPolicy({
                    ...policy,
                    max_files: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              总字节
              <input
                type="number"
                min={1}
                value={policy.max_total_bytes}
                onChange={(event) =>
                  setPolicy({
                    ...policy,
                    max_total_bytes: Number(event.target.value),
                  })
                }
              />
            </label>
            <button type="submit">保存策略（需近期 MFA）</button>
          </form>
        ) : null}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>文件状态</h2>
          <button type="button" onClick={() => void load()}>
            刷新
          </button>
        </div>
        <input
          value={fileFilter}
          onChange={(event) => setFileFilter(event.target.value)}
          placeholder="筛选名称、status 或 write_outcome"
          aria-label="File filter"
        />
        {files.some(
          (file) =>
            file.status === 'deleting' || file.write_outcome === 'unknown',
        ) ? (
          <p className="warning" role="alert">
            存在 deleting/unknown
            文件：不要释放预算或重复上传；等待状态查询/worker
            结算，页面不提供绕过状态机的恢复按钮。
          </p>
        ) : null}
        {visibleFiles.length === 0 ? (
          <p className="muted">暂无文件。</p>
        ) : (
          <div className="data-list">
            {visibleFiles.map((file) => (
              <div key={file.file_id} className="file-row">
                <div>
                  <strong>{file.original_name ?? 'unnamed file'}</strong>
                  <small>
                    {file.file_id} · {file.status} · {file.write_outcome} ·{' '}
                    {formatBytes(file.reserved_bytes)}
                  </small>
                </div>
                <div className="file-actions">
                  <button
                    type="button"
                    disabled={
                      file.status !== 'active' ||
                      file.write_outcome !== 'confirmed'
                    }
                    onClick={() =>
                      void download(file.file_id, file.original_name)
                    }
                  >
                    下载
                  </button>
                  <button
                    type="button"
                    disabled={
                      file.status === 'deleted' || file.status === 'deleting'
                    }
                    onClick={() => void remove(file.file_id)}
                  >
                    受控删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="section-heading">
          <span className="muted">每页 20 条；游标由服务端返回。</span>
          <button
            type="button"
            disabled={!nextCursor}
            onClick={() => void load(nextCursor ?? undefined)}
          >
            下一页
          </button>
        </div>
      </section>
      <a className="link" href="/admin">
        返回控制中心
      </a>
      <a className="link" href="/admin/deletion-jobs">
        打开 Global Delete 任务
      </a>
    </main>
  );
}
