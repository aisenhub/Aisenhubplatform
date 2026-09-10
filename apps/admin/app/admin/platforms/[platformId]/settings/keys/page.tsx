import { PlatformRoutePlaceholder } from '../../../../../../components/platform-context/platform-route-placeholder';

export default async function PlatformKeysPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  const { platformId } = await params;
  return (
    <PlatformRoutePlaceholder
      title="平台 Keys"
      description="平台 Key 的轮换、部署确认和撤销诊断。当前兼容操作保留在平台设置页。"
      platformId={platformId}
      nextPhase="Phase 03"
    />
  );
}
