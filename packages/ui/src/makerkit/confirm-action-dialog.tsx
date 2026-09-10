'use client';

import { useEffect, useState } from 'react';
import type { ReactNode, FormEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { MutationButton } from '@kit/ui/mutation-button';
import type { MutationState } from '@kit/ui/mutation-state';
import { ResourceId } from '@kit/ui/resource-id';
import { SupportErrorId } from '@kit/ui/support-error-id';

export type ConfirmActionError = {
  title: string;
  description: string;
  requestId?: string | null;
  technicalDetail?: ReactNode;
};

type ConfirmActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  targetIdentity: string;
  impact: string;
  reversible: boolean;
  asyncOperation?: boolean;
  historyRetained?: boolean;
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  stepUpNote?: string;
  state?: MutationState;
  error?: ConfirmActionError | null;
  stepUpContent?: ReactNode;
  onStepUpVerified?: () => void;
  onCheckUnknown?: () => Promise<void> | void;
  onConfirm: (reason: string) => Promise<void> | void;
};

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  targetIdentity,
  impact,
  reversible,
  asyncOperation = true,
  historyRetained = true,
  reasonRequired = false,
  reasonLabel = '操作原因',
  reasonPlaceholder = '填写不包含个人信息的原因',
  stepUpNote = '敏感操作可能需要近期 MFA；系统会在服务端判断，不由页面计算有效期。',
  state = 'confirm_required',
  error,
  stepUpContent,
  onStepUpVerified,
  onCheckUnknown,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pending = submitting || state === 'pending';

  useEffect(() => {
    if (!open) {
      setReason('');
      setReasonError('');
      setSubmitting(false);
    }
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || state === 'accepted') return;
    if (reasonRequired && !reason.trim()) {
      setReasonError('请填写操作原因。');
      return;
    }
    setReasonError('');
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent data-test="confirm-action-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            请核对目标和影响后再继续。确认提交后，关闭窗口不会取消服务端操作。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              目标
            </div>
            <ResourceId
              value={targetIdentity}
              label={targetIdentity}
              className="mt-1 text-foreground"
            />
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              影响
            </span>
            <span>{impact}</span>
          </div>
          <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div>
              <dt>可撤销</dt>
              <dd className="m-0 mt-1 text-sm text-foreground">
                {reversible ? '是' : '否'}
              </dd>
            </div>
            <div>
              <dt>异步</dt>
              <dd className="m-0 mt-1 text-sm text-foreground">
                {asyncOperation ? '是' : '否'}
              </dd>
            </div>
            <div>
              <dt>历史记录</dt>
              <dd className="m-0 mt-1 text-sm text-foreground">
                {historyRetained ? '保留' : '不保留'}
              </dd>
            </div>
          </dl>
        </div>

        {state === 'step_up_required' ? (
          <Alert data-test="confirm-action-step-up">
            <AlertTitle>需要近期 MFA</AlertTitle>
            <AlertDescription>
              原操作 intent 仍被保留，MFA
              成功后不会自动重放；请回到这里再次确认提交。
              {stepUpContent ? (
                <div className="mt-3">{stepUpContent}</div>
              ) : null}
              {onStepUpVerified ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={onStepUpVerified}
                  data-test="confirm-action-step-up-ack"
                >
                  我已完成验证，回到确认
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive" data-test="confirm-action-error">
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription>
              {error.description}
              <SupportErrorId
                requestId={error.requestId}
                technicalDetail={error.technicalDetail}
              />
            </AlertDescription>
          </Alert>
        ) : null}

        <form className="grid gap-4" onSubmit={submit}>
          {reasonRequired ? (
            <div className="grid gap-2">
              <Label htmlFor="confirm-action-reason">{reasonLabel}</Label>
              <Input
                id="confirm-action-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (reasonError) setReasonError('');
                }}
                placeholder={reasonPlaceholder}
                maxLength={500}
                disabled={pending || state === 'step_up_required'}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={
                  reasonError ? 'confirm-action-reason-error' : undefined
                }
                data-test="confirm-action-reason"
              />
              {reasonError ? (
                <p
                  id="confirm-action-reason-error"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {reasonError}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs leading-5 text-muted-foreground">
            {stepUpNote}
          </p>
          <DialogFooter>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  data-test="confirm-action-cancel"
                />
              }
            >
              取消
            </DialogClose>
            {state === 'unknown_outcome' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void onCheckUnknown?.()}
                disabled={!onCheckUnknown}
                data-test="confirm-action-check-unknown"
              >
                检查当前状态
              </Button>
            ) : (
              <MutationButton
                type="submit"
                variant={reversible ? 'default' : 'destructive'}
                state={state}
                disabled={
                  state === 'step_up_required' ||
                  state === 'success' ||
                  state === 'accepted'
                }
                data-test="confirm-action-submit"
              >
                确认提交
              </MutationButton>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
