import { Badge } from '@kit/ui/badge';
import { cn } from '@kit/ui/utils';

export type StatusTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'unknown';

const toneClasses: Record<StatusTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning-foreground',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
  unknown: 'border-warning/40 bg-warning/15 text-warning-foreground',
};

type StatusBadgeProps = {
  label: string;
  tone: StatusTone;
  rawValue?: string | null;
  className?: string;
};

export function StatusBadge({
  label,
  tone,
  rawValue,
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      data-test="status-badge"
      data-status={rawValue ?? tone}
      className={cn('gap-1.5', toneClasses[tone], className)}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-current opacity-80"
      />
      {label}
    </Badge>
  );
}
