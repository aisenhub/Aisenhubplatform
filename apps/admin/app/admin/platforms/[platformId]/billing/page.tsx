import { PlatformBillingPage } from '../../../../../features/billing/platform-billing-page';

export default async function AdminPlatformBillingRoute({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  await params;
  return <PlatformBillingPage />;
}
