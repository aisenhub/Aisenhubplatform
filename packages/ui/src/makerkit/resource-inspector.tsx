'use client';

import type { ReactNode } from 'react';
import { XIcon } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@kit/ui/sheet';

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md lg:max-w-[28rem]"
        data-test="resource-inspector"
      >
        <SheetHeader className="border-b border-border/70 p-5 pr-14">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <SheetClose
          aria-label="关闭详情"
          data-test="resource-inspector-close-icon"
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4"
            />
          }
        >
          <XIcon />
          <span className="sr-only">关闭详情</span>
        </SheetClose>
        <div className="grid flex-1 gap-4 p-5">{children}</div>
        <SheetFooter className="border-t border-border/70 p-4">
          {footer}
          <SheetClose
            render={
              <Button variant="outline" data-test="resource-inspector-close" />
            }
          >
            关闭
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
