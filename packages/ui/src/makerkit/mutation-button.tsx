'use client';

import type { ComponentProps } from 'react';

import { LoaderCircle } from 'lucide-react';

import { Button } from '@kit/ui/button';

import { mutationStateLabel, type MutationState } from './mutation-state';

type MutationButtonProps = ComponentProps<typeof Button> & {
  state?: MutationState;
  pendingLabel?: string;
};

export function MutationButton({
  state = 'idle',
  pendingLabel = '处理中…',
  children,
  disabled,
  ...props
}: MutationButtonProps) {
  const isPending = state === 'pending';
  const isAccepted = state === 'accepted';
  const label = isPending
    ? pendingLabel
    : isAccepted
      ? '已受理'
      : (children ?? mutationStateLabel(state));

  return (
    <Button
      {...props}
      disabled={disabled || isPending || isAccepted}
      aria-busy={isPending || undefined}
      data-mutation-state={state}
    >
      {isPending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : null}
      {label}
    </Button>
  );
}
