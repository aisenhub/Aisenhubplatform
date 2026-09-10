import { PlatformRoutePlaceholder } from '../../../../../components/platform-context/platform-route-placeholder';

export default async function PlatformPlansPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  const { platformId } = await params;
  return (
    <PlatformRoutePlaceholder
      title="平台计划"
      description="当前平台上下文下的计划与权益配置。"
      platformId={platformId}
      nextPhase="Phase 05"
    />
  );
}
