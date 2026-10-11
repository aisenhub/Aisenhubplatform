import { redirect } from 'next/navigation';

export default async function PlatformKeysPage({
  params,
}: {
  params: Promise<{ platformId: string }>;
}) {
  const { platformId } = await params;
  redirect(
    `/admin/platforms/${encodeURIComponent(platformId)}/settings/integration?section=keys`,
  );
}
