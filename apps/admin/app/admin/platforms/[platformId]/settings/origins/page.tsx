import { PlatformRoutePlaceholder } from '../../../../../../components/platform-context/platform-route-placeholder';

export default async function PlatformOriginsPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  const { platformId } = await params;
  return (
    <PlatformRoutePlaceholder
      title="平台 Origins"
      description="Origin 登记和回调地址诊断。当前兼容操作保留在平台设置页。"
      platformId={platformId}
      nextPhase="Phase 03"
    />
  );
}
