import { PlatformRoutePlaceholder } from '../../../../../components/platform-context/platform-route-placeholder';

export default async function PlatformRedemptionBatchesPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  const { platformId } = await params;
  return (
    <PlatformRoutePlaceholder
      title="兑换批次"
      description="当前平台上下文下的兑换批次和使用情况。"
      platformId={platformId}
      nextPhase="Phase 05"
    />
  );
}
