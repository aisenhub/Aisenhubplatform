import type { ReactNode } from 'react';

import { PlatformWorkspace } from '../../../../components/platform-context/platform-workspace';

export default async function PlatformLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ platformId: string }>;
}) {
  const { platformId } = await params;
  return (
    <PlatformWorkspace platformId={platformId}>{children}</PlatformWorkspace>
  );
}
