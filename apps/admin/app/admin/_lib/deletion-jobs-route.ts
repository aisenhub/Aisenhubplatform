export type AdminSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

export async function deletionJobsRedirectTarget(
  searchParams: AdminSearchParams,
): Promise<string> {
  const incoming = await searchParams;
  const target = new URLSearchParams();
  const jobId = first(incoming.job_id);
  const query = first(incoming.q);
  if (jobId) target.set('job_id', jobId);
  if (query) target.set('q', query);
  const suffix = target.toString();
  return suffix
    ? `/admin/accounts/deletion-jobs?${suffix}`
    : '/admin/accounts/deletion-jobs';
}
