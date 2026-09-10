import { PlatformRoutePlaceholder } from '../../../../../components/platform-context/platform-route-placeholder';

export default async function PlatformSubscriptionsPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  const { platformId } = await params;
  return (
    <PlatformRoutePlaceholder
      title="平台订阅"
      description="当前平台上下文下的订阅读取和受控动作。"
      platformId={platformId}
      nextPhase="Phase 05"
    />
  );
}
