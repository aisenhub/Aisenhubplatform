import { PlatformRoutePlaceholder } from '../../../../../components/platform-context/platform-route-placeholder';

export default async function PlatformAccountsPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  const { platformId } = await params;
  return (
    <PlatformRoutePlaceholder
      title="平台账户"
      description="当前平台上下文下的账户目录。"
      platformId={platformId}
      nextPhase="Phase 04"
    />
  );
}
