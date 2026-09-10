'use client';

import { ReactNode, useCallback, useState } from 'react';

import { Check, Copy } from 'lucide-react';

import { cn } from '../lib/utils';
import { toast } from './sonner';

interface CopyToClipboardProps {
  children: ReactNode;
  value?: string;
  className?: string;
  dataTest?: string;
  tooltipText?: string;
  successMessage?: string;
  errorMessage?: string;
}

/**
 * A component that copies text to clipboard when clicked
 */
export function CopyToClipboard({
  children,
  className,
  value = undefined,
  dataTest = 'copy-to-clipboard',
  tooltipText = '复制到剪贴板',
  successMessage = '已复制到剪贴板',
  errorMessage = '复制失败，请检查浏览器权限',
}: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation();

      const textToCopy = children?.toString() || '';

      navigator.clipboard
        .writeText(value ?? textToCopy)
        .then(() => {
          setCopied(true);
          toast.success(successMessage);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          toast.error(errorMessage);
        });
    },
    [children, value, successMessage, errorMessage],
  );

  if (typeof value === 'undefined') {
    return children;
  }

  return (
    <button
      type="button"
      data-test={dataTest}
      title={tooltipText}
      aria-label={`${tooltipText}：${children?.toString() ?? ''}`}
      onClick={handleCopy}
      className={cn(
        'group group/button -mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 transition-colors hover:underline',
        className,
      )}
    >
      {children}

      <span className="text-muted-foreground transition-opacity">
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </span>
    </button>
  );
}
