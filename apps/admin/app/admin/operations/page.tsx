import { Suspense } from 'react';

import { OperationsCenterPage } from '../../../features/operations/operations-center-page';

export default function AdminOperationsPage() {
  return (
    <Suspense
      fallback={
        <main className="shell wide-shell" data-test="operations-page-loading">
          <div
            className="grid gap-3"
            aria-busy="true"
            aria-label="正在加载运维任务"
          >
            <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
            <div className="h-5 w-full max-w-2xl animate-pulse rounded-md bg-muted" />
            <div className="mt-4 h-72 rounded-xl border border-border bg-card" />
          </div>
        </main>
      }
    >
      <OperationsCenterPage />
    </Suspense>
  );
}
