import { PlatformRedemptionBatchesPage as PlatformRedemptionBatchesFeaturePage } from '../../../../../features/redemption/platform-redemption-batches-page';

export default async function PlatformRedemptionBatchesPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  await params;
  return <PlatformRedemptionBatchesFeaturePage />;
}
