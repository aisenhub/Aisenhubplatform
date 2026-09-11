'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { ConsumerShell, Icon } from '../../components/consumer-shell';

type ConfigFile = {
  id: string;
  name: string;
  kind: string;
  size: string;
  updated: string;
  status: '已同步' | '有更新';
};

const initialFiles: ConfigFile[] = [
  {
    id: 'dev-environment',
    name: 'dev-environment.json',
    kind: 'JSON 配置',
    size: '2 KB',
    updated: '今天 14:32',
    status: '已同步',
  },
  {
    id: 'production',
    name: 'production.yaml',
    kind: 'YAML 配置',
    size: '4 KB',
    updated: '昨天 09:11',
    status: '已同步',
  },
  {
    id: 'database',
    name: 'database.yml',
    kind: 'YAML 配置',
    size: '1 KB',
    updated: '10 月 24 日',
    status: '有更新',
  },
  {
    id: 'app-config',
    name: 'app-config.json',
    kind: 'JSON 配置',
    size: '3 KB',
    updated: '10 月 20 日',
    status: '已同步',
  },
  {
    id: 'nginx',
    name: 'nginx.conf',
    kind: 'CONF 配置',
    size: '6 KB',
    updated: '10 月 18 日',
    status: '已同步',
  },
];

export default function FilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(initialFiles);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  function addFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.includes('.')
      ? file.name.split('.').pop()?.toUpperCase()
      : 'FILE';
    setFiles((current) => [
      {
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        kind: `${extension} 配置`,
        size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        updated: '刚刚',
        status: '已同步',
      },
      ...current,
    ]);
    setNotice(`${file.name} 已加入配置列表`);
    event.target.value = '';
  }

  function deleteFile(id: string) {
    const file = files.find((item) => item.id === id);
    setFiles((current) => current.filter((item) => item.id !== id));
    setPendingDelete(null);
    if (file) setNotice(`${file.name} 已删除`);
  }

  return (
    <ConsumerShell
      title="配置文件"
      description="集中管理你上传过的环境配置。列表、上传和删除操作都在一个清晰的工作区内完成。"
      actions={
        <>
          <input
            ref={fileInputRef}
            className="consumer-visually-hidden"
            type="file"
            accept=".json,.yaml,.yml,.conf,.env,.txt"
            onChange={addFile}
          />
          <button
            className="consumer-button consumer-button-primary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <span>上传配置</span>
            <Icon name="arrow" size={17} />
          </button>
        </>
      }
    >
      <section className="consumer-files-toolbar" aria-label="配置文件概览">
        <div>
          <p className="consumer-overline">我的文件</p>
          <h2>{files.length} 个配置文件</h2>
        </div>
        <div className="consumer-files-toolbar-meta">
          <span>支持 JSON、YAML、CONF 和 ENV</span>
          <span className="consumer-status">本地演示</span>
        </div>
      </section>

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
            {notice}
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
          {files.map((file) => (
            <div className="consumer-file-row" key={file.id}>
              <div className="consumer-file-primary">
                <span className="consumer-file-icon">
                  <Icon name="file" size={18} />
                </span>
                <span>
                  <strong>{file.name}</strong>
                  <small>
                    {file.kind} · {file.size}
                  </small>
                </span>
              </div>
              <span className="consumer-file-updated">{file.updated}</span>
              <span
                className={`consumer-status ${file.status === '有更新' ? 'is-warm' : ''}`}
              >
                {file.status}
              </span>
              <div className="consumer-file-actions">
                {pendingDelete === file.id ? (
                  <>
                    <button
                      className="consumer-small-button consumer-small-button-danger"
                      type="button"
                      onClick={() => deleteFile(file.id)}
                    >
                      确认删除
                    </button>
                    <button
                      className="consumer-small-button"
                      type="button"
                      onClick={() => setPendingDelete(null)}
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    className="consumer-small-button consumer-small-button-quiet"
                    type="button"
                    onClick={() => setPendingDelete(file.id)}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
          {files.length === 0 ? (
            <div className="consumer-empty-state">
              <span className="consumer-file-icon">
                <Icon name="file" size={20} />
              </span>
              <strong>还没有配置文件</strong>
              <span>上传第一个配置文件，它会出现在这里。</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="consumer-note-panel">
        <div>
          <strong>配置文件的安全提示</strong>
          <p>
            真实平台接入时，建议由服务端完成文件大小限制、权限校验和删除操作；浏览器不应直接持有
            Storage 密钥。
          </p>
        </div>
        <span className="consumer-status">本地演示</span>
      </section>
    </ConsumerShell>
  );
}
