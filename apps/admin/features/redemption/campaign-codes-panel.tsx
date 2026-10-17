'use client';

import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { StatusBadge } from '@kit/ui/status-badge';
import { NativeSelect } from '@kit/ui/native-select';

import { adminAuthSession } from '../../app/_lib/auth-session';
import {
  formatUtc,
  resourceError,
  statusLabel,
  statusTone,
  type ResourceError,
} from '../resources/admin-resource-utils';

type CampaignOption = { batch_id: string; name: string };
type CampaignCode = {
  redemption_code_id: string;
  code_prefix: string | null;
  code_suffix: string | null;
  status: string;
  redeemed_platform_account_id: string | null;
  redeemed_user_id: string | null;
  redeemed_display_name: string | null;
  redeemed_at: string | null;
};

type PagePayload = {
  data?: CampaignCode[];
  next_cursor?: string | null;
  request_id?: string;
  error?: { code?: string; message?: string };
};

export function CampaignCodesPanel({
  platformId,
  campaigns,
}: {
  platformId: string;
  campaigns: CampaignOption[];
}) {
  const [batchId, setBatchId] = useState('');
  const [rows, setRows] = useState<CampaignCode[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);

  async function load(cursor: string | null = null) {
    if (!batchId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('cursor', cursor);
      const response = await adminAuthSession.request(
        `/api/v1/admin/api/v1/platforms/${encodeURIComponent(platformId)}/commerce/campaigns/${encodeURIComponent(batchId)}/codes?${params}`,
        { cache: 'no-store' },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as PagePayload | null;
      if (!response.ok || !Array.isArray(payload?.data)) {
        setError(resourceError(response, payload, 'Campaign 单码明细'));
        return;
      }
      setRows((known) =>
        cursor ? [...known, ...payload.data!] : payload.data!,
      );
      setNextCursor(payload.next_cursor ?? null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel gap-4" data-test="campaign-code-detail">
      <div>
        <h2>Campaign 单码明细</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          只读取 prefix/suffix、状态和兑换账户归因；明文与 HMAC 永不进入该管理
          DTO。
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <NativeSelect
          wrapperClassName="flex-1"
          value={batchId}
          onChange={(event) => {
            setBatchId(event.target.value);
            setRows([]);
            setNextCursor(null);
          }}
          aria-label="Campaign 明细批次"
        >
          <option value="">选择 Campaign</option>
          {campaigns.map((campaign) => (
            <option key={campaign.batch_id} value={campaign.batch_id}>
              {campaign.name} · {campaign.batch_id}
            </option>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          disabled={!batchId || loading}
          onClick={() => void load()}
        >
          {loading ? '读取中…' : '读取脱敏单码'}
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.description}</AlertDescription>
        </Alert>
      ) : null}
      {rows.length ? (
        <div className="grid gap-2">
          {rows.map((code) => (
            <article
              key={code.redemption_code_id}
              className="grid gap-2 rounded-lg border border-border p-3 text-sm md:grid-cols-[1fr_auto_1.5fr] md:items-center"
            >
              <span className="font-mono">
                {code.code_prefix ?? '••••'}…{code.code_suffix ?? '••••'}
              </span>
              <StatusBadge
                label={statusLabel(code.status)}
                tone={statusTone(code.status)}
                rawValue={code.status}
              />
              <span className="text-muted-foreground">
                {code.redeemed_display_name ??
                  code.redeemed_platform_account_id ??
                  code.redeemed_user_id ??
                  '尚未兑换'}
                {code.redeemed_at ? ` · ${formatUtc(code.redeemed_at)}` : ''}
              </span>
            </article>
          ))}
        </div>
      ) : batchId && !loading ? (
        <p className="text-sm text-muted-foreground">当前页没有单码记录。</p>
      ) : null}
      {nextCursor ? (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => void load(nextCursor)}
        >
          加载更多单码
        </Button>
      ) : null}
    </section>
  );
}
