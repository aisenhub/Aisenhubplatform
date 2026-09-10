import type { ReactNode } from 'react';

type SupportErrorIdProps = {
  requestId?: string | null;
  technicalDetail?: ReactNode;
};

export function SupportErrorId({
  requestId,
  technicalDetail,
}: SupportErrorIdProps) {
  if (!requestId && !technicalDetail) return null;

  return (
    <details className="mt-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <summary
        data-test="technical-details"
        className="cursor-pointer font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        技术详情
      </summary>
      <dl className="mt-2 grid gap-2">
        {requestId ? (
          <div className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:items-start">
            <dt>请求 ID</dt>
            <dd className="m-0 break-all font-mono text-foreground">
              {requestId}
            </dd>
          </div>
        ) : null}
        {technicalDetail ? (
          <div className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:items-start">
            <dt>服务端状态</dt>
            <dd className="m-0 break-all font-mono text-foreground">
              {technicalDetail}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}
