import { redirect } from 'next/navigation';

import {
  deletionJobsRedirectTarget,
  type AdminSearchParams,
} from '../_lib/deletion-jobs-route';

export default async function AdminDeletionJobsPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  redirect(await deletionJobsRedirectTarget(searchParams));
}
