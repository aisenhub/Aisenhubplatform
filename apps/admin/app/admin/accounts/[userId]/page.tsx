import { IdentityDetailPage } from '../../../../features/accounts/identity-detail-page';

export default async function AdminIdentityDetailRoute({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <IdentityDetailPage userId={userId} />;
}
