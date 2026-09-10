import { PlatformAccountsPage as PlatformAccountsFeaturePage } from '../../../../../features/accounts/platform-accounts-page';

export default async function PlatformAccountsPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  await params;
  return <PlatformAccountsFeaturePage />;
}
