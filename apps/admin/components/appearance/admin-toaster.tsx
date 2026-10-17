'use client';

import { Toaster } from '@kit/ui/sonner';

import { useAdminAppearance } from './admin-appearance';

export function AdminToaster() {
  const { resolvedTheme } = useAdminAppearance();
  return <Toaster position="bottom-right" theme={resolvedTheme} />;
}
