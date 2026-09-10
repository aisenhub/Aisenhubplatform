import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { Skeleton } from '@kit/ui/skeleton';

import { SupportErrorId } from '@kit/ui/support-error-id';

type AsyncStateProps = {
  state: 'loading' | 'error' | 'access';
  title?: string;
  description?: string;
  requestId?: string | null;
  technicalDetail?: ReactNode;
  onRetry?: () => void;
};

export function AsyncState({
  state,
  title,
  description,
  requestId,
  technicalDetail,
  onRetry,
}: AsyncStateProps) {
  if (state === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label="正在加载"
        className="grid gap-3"
        data-test="async-loading"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-5/6" />
        <Skeleton className="h-10 w-4/6" />
      </div>
    );
  }

  if (state === 'access') {
    return (
      <Alert data-test="access-error">
        <AlertTitle>{title ?? '无法访问此页面'}</AlertTitle>
        <AlertDescription>
          {description ?? '请重新登录或联系管理员确认访问权限。'}
        </AlertDescription>
        <SupportErrorId
          requestId={requestId}
          technicalDetail={technicalDetail}
        />
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" data-test="recoverable-error">
      <AlertTitle>{title ?? '暂时无法读取数据'}</AlertTitle>
      <AlertDescription>
        {description ??
          '请检查网络连接后重试。当前页面不会把读取失败显示为暂无数据。'}
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-test="async-retry"
            className="mt-3"
            onClick={onRetry}
          >
            重试
          </Button>
        ) : null}
        <SupportErrorId
          requestId={requestId}
          technicalDetail={technicalDetail}
        />
      </AlertDescription>
    </Alert>
  );
}
