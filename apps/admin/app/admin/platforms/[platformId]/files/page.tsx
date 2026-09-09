import { PlatformRoutePlaceholder } from '../../../../../components/platform-context/platform-route-placeholder';

export default async function PlatformFilesPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  const { platformId } = await params;
  return (
    <PlatformRoutePlaceholder
      title="平台文件"
      description="当前平台上下文下的文件策略和配置文件状态。"
      platformId={platformId}
      nextPhase="Phase 06"
    />
  );
}
