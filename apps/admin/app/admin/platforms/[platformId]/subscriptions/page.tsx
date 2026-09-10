import { PlatformSubscriptionPage } from '../../../../../features/subscriptions/platform-subscription-page';

export default async function PlatformSubscriptionsPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  await params;
  return <PlatformSubscriptionPage />;
}
