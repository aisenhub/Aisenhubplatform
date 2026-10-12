import { AccountWorkbenchPage } from '../../../../../../features/accounts/account-workbench-page';

export default async function PlatformAccountWorkbenchRoute({
  params,
}: {
  params: Promise<{ platformId: string; accountId: string }>;
}) {
  const { accountId } = await params;
  return <AccountWorkbenchPage accountId={accountId} />;
}
