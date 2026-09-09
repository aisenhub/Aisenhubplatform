'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminFilterInput } from '../components/admin-filter-input';
import {
  adminAuthSession,
  sessionErrorMessage,
  useAdminSessionSnapshot,
} from '../../_lib/auth-session';

type Job = {
  job_id: string;
  request_id: string;
  state: string;
  checkpoint: string;
  retry_count: number;
  last_error_code: string | null;
};

function purgeReason(job: Job): string | null {
  if (job.state === 'blocked') {
    return `Purge blocked：${job.last_error_code ?? '等待人工处理'}。不会宣称清除完成。`;
  }
  if (job.state === 'retry') {
    return `Purge retry：${job.last_error_code ?? 'worker 将按退避重试'}。`;
  }
  return null;
}

function requestUrl(path: string): string {
  return `/api/v1/admin/api/v1/${path}`;
}

export default function AdminDeletionJobsPage() {
  const sessionSnapshot = useAdminSessionSnapshot();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobFilter, setJobFilter] = useState('');
  const [requestId, setRequestId] = useState('');
  const [status, setStatus] = useState('正在读取删除任务…');

  useEffect(() => {
    if (
      !sessionSnapshot.resolved ||
      !['unauthenticated', 'expired'].includes(sessionSnapshot.state)
    )
      return;
    setJobs([]);
    setRequestId('');
    setStatus('会话已结束，删除任务数据已清理。');
  }, [sessionSnapshot.resolved, sessionSnapshot.state]);

  const load = useCallback(async () => {
    const epoch = adminAuthSession.getEpoch();
    let response: Response;
    try {
      response = await adminAuthSession.request(
        requestUrl('deletion-jobs?limit=100'),
      );
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      return;
    }
    if (!response.ok) {
      setStatus('任务读取失败，请确认 AAL2 管理员会话。');
      return;
    }
    const body = (await response.json()) as { data?: Job[] };
    if (!adminAuthSession.isCurrentEpoch(epoch)) return;
    setJobs(body.data ?? []);
    setStatus('删除任务状态已刷新。');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleJobs = jobs.filter((job) =>
    `${job.state} ${job.checkpoint} ${job.job_id} ${job.request_id} ${job.last_error_code ?? ''}`
      .toLowerCase()
      .includes(jobFilter.trim().toLowerCase()),
  );

  async function start() {
    if (!requestId) return;
    let response: Response;
    try {
      response = await adminAuthSession.request(
        requestUrl('deletion-jobs'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ request_id: requestId }),
        },
        { replay: 'never' },
      );
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      return;
    }
    setStatus(
      response.ok
        ? '删除任务已批准并排队；provider 步骤仍需 worker 回报。'
        : '任务启动失败，请确认请求状态和近期 MFA proof。',
    );
    if (response.ok) {
      setRequestId('');
      await load();
    }
  }

  async function retry(jobId: string) {
    let response: Response;
    try {
      response = await adminAuthSession.request(
        requestUrl(`deletion-jobs/${jobId}/retry`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: '{}',
        },
        { replay: 'never' },
      );
    } catch (error) {
      setStatus(sessionErrorMessage(error));
      return;
    }
    setStatus(
      response.ok
        ? '删除任务已重新排队。'
        : '任务重试失败：仅 blocked/retry 任务允许近期 MFA 重试。',
    );
    if (response.ok) await load();
  }

  return (
    <main className="shell wide-shell">
      <p className="eyebrow">Aisenhub Admin · M4</p>
      <h1>Deletion jobs</h1>
      <p className="muted">
        每个 checkpoint 都必须由 worker 报告真实结果；Auth、Storage
        或备份屏障失败时保留 blocked/retry，不宣称清除完成。
      </p>
      <p className="muted" role="status">
        {status}
      </p>
      <section className="panel stack-form">
        <label htmlFor="request-id">待审批 deletion request ID</label>
        <input
          id="request-id"
          value={requestId}
          onChange={(event) => setRequestId(event.target.value)}
          placeholder="UUID"
          inputMode="text"
        />
        <button
          type="button"
          onClick={() => void start()}
          disabled={!requestId}
        >
          批准并启动（需近期 MFA）
        </button>
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>任务状态</h2>
            <AdminFilterInput
              id="deletion-job-filter"
              label="筛选任务"
              value={jobFilter}
              onChange={setJobFilter}
              placeholder="state、checkpoint 或 request ID"
            />
          </div>
          <button type="button" onClick={() => void load()}>
            刷新
          </button>
        </div>
        {visibleJobs.length === 0 ? (
          <p className="muted">暂无删除任务。</p>
        ) : (
          <div className="data-list">
            {visibleJobs.map((job) => (
              <div key={job.job_id} className="file-row">
                <div>
                  <strong>
                    {job.state} · {job.checkpoint}
                  </strong>
                  <small>
                    {job.job_id} · request {job.request_id} · retry{' '}
                    {job.retry_count}
                    {job.last_error_code ? ` · ${job.last_error_code}` : ''}
                  </small>
                  {purgeReason(job) ? (
                    <small className="warning" role="status">
                      {purgeReason(job)}
                    </small>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={!['blocked', 'retry'].includes(job.state)}
                  onClick={() => void retry(job.job_id)}
                >
                  重试
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <a className="link" href="/admin">
        返回控制中心
      </a>
    </main>
  );
}
