'use client';

import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { CopyToClipboard } from '@kit/ui/copy-to-clipboard';

type OneTimeSecretPanelProps = {
  secret: string;
  title?: string;
  description?: string;
  acknowledgeLabel?: string;
  onAcknowledged: () => void;
};

export function OneTimeSecretPanel({
  secret,
  title = '敏感值只显示这一次',
  description = '请立即保存到受控位置。关闭或确认后，页面不会再次读取或生成这段明文。',
  acknowledgeLabel = '我已保存，清除页面明文',
  onAcknowledged,
}: OneTimeSecretPanelProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => setAcknowledged(false), [secret]);

  if (acknowledged) return null;

  return (
    <Alert data-test="one-time-secret-panel">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}
        <CopyToClipboard
          value={secret}
          dataTest="one-time-secret-copy"
          tooltipText="复制一次性敏感值"
          successMessage="敏感值已复制；请勿分享"
          className="mt-3 flex w-full break-all rounded-md bg-muted p-3 font-mono text-xs text-foreground"
        >
          {secret}
        </CopyToClipboard>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            setAcknowledged(true);
            onAcknowledged();
          }}
          data-test="one-time-secret-acknowledge"
        >
          {acknowledgeLabel}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
