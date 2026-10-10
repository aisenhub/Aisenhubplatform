import { describe, expect, it } from 'vitest';

import { deletionJobsRedirectTarget } from './deletion-jobs-route';

describe('deletion jobs compatibility route', () => {
  it('redirects the legacy operations route to the unified user subview', async () => {
    await expect(deletionJobsRedirectTarget(Promise.resolve({}))).resolves.toBe(
      '/admin/accounts/deletion-jobs',
    );
  });

  it('preserves job_id and q while dropping unknown legacy parameters', async () => {
    await expect(
      deletionJobsRedirectTarget(
        Promise.resolve({
          job_id: '00000000-0000-4000-8000-000000000123',
          q: 'blocked retry',
          legacy: 'drop-me',
        }),
      ),
    ).resolves.toBe(
      '/admin/accounts/deletion-jobs?job_id=00000000-0000-4000-8000-000000000123&q=blocked+retry',
    );
  });

  it('uses only the first value when Next.js supplies repeated parameters', async () => {
    await expect(
      deletionJobsRedirectTarget(
        Promise.resolve({
          job_id: ['job-a', 'job-b'],
          q: ['first', 'second'],
        }),
      ),
    ).resolves.toBe('/admin/accounts/deletion-jobs?job_id=job-a&q=first');
  });
});
