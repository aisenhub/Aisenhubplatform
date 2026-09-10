import { PlatformPlansPage as PlatformPlansFeaturePage } from '../../../../../features/plans/platform-plans-page';

export default async function PlatformPlansPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  await params;
  return <PlatformPlansFeaturePage />;
}
