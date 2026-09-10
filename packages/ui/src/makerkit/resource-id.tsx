import { CopyToClipboard } from '@kit/ui/copy-to-clipboard';
import { cn } from '@kit/ui/utils';

type ResourceIdProps = {
  value: string;
  label?: string;
  className?: string;
};

export function ResourceId({
  value,
  label = value,
  className,
}: ResourceIdProps) {
  return (
    <CopyToClipboard
      value={value}
      dataTest="resource-id-copy"
      tooltipText="复制 ID"
      successMessage="ID 已复制到剪贴板"
      className={cn(
        'max-w-full break-all text-left font-mono text-xs text-muted-foreground',
        className,
      )}
    >
      {label}
    </CopyToClipboard>
  );
}
