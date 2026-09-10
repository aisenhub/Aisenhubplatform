'use client';

import type { ReactNode } from 'react';

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

type ResourceInspectorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function ResourceInspector({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: ResourceInspectorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(42rem,calc(100svh-2rem))] max-w-2xl overflow-y-auto"
        data-test="resource-inspector"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="grid gap-4">{children}</div>
        <DialogFooter>
          {footer}
          <DialogClose
            render={
              <Button variant="outline" data-test="resource-inspector-close" />
            }
          >
            关闭
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
