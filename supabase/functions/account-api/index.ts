/// <reference lib="deno.ns" />

import {
  type AccountApiDependencies,
  ApiFault,
  verifiedSessionFromRequest,
  verifiedSessionFromAccessToken,
  requestId,
  response,
  mapSqlFault,
  database,
  setRole,
  requestPath,
} from './core.ts';
import { dispatchAccount } from './account.ts';
import { dispatchAdmin } from './admin.ts';
import { handleDownload, handleUploadContent } from './files.ts';

export async function handleRequest(
  request: Request,
  dependencies: AccountApiDependencies = {},
): Promise<Response> {
  const id = requestId();
  try {
    const path = requestPath(request);
    const optionalSessionRead =
      request.method === 'GET' &&
      (path === 'v1/plans' || path === 'v1/subscription/products');
    const session =
      path.startsWith('admin/') ||
      (optionalSessionRead && request.headers.has('authorization')) ||
      !optionalSessionRead
        ? await verifiedSessionFromRequest(request, dependencies)
        : undefined;
    const reauthSession =
      path === 'v1/auth/recent-proof' && request.method === 'POST'
        ? await verifiedSessionFromAccessToken(
            request.headers.get('x-reauth-access-token') ?? '',
            dependencies,
          )
        : undefined;
    if (
      path.startsWith('v1/config-files/') &&
      path.endsWith('/content') &&
      request.method === 'PUT'
    ) {
      if (!session) throw new ApiFault(401, 'UNAUTHORIZED');
      return response(
        {
          data: (await handleUploadContent(request, dependencies, session))
            .data,
          request_id: id,
        },
        202,
        id,
      );
    }
    if (
      path.startsWith('v1/config-files/') &&
      path.endsWith('/content') &&
      request.method === 'GET'
    ) {
      if (!session) throw new ApiFault(401, 'UNAUTHORIZED');
      return await handleDownload(request, dependencies, session, false);
    }
    if (
      path.startsWith('admin/api/v1/config-files/') &&
      path.endsWith('/content') &&
      request.method === 'GET'
    ) {
      if (!session) throw new ApiFault(401, 'UNAUTHORIZED');
      return await handleDownload(request, dependencies, session, true);
    }
    const executor = path.startsWith('admin/') ? 'admin' : 'account';
    const db = dependencies.database ?? database(executor);
    const result = await db.begin(async (transaction) => {
      if (path.startsWith('admin/')) {
        if (!session) throw new ApiFault(401, 'UNAUTHORIZED');
        await setRole(transaction, 'admin_executor');
        return dispatchAdmin(request, transaction, dependencies, session);
      }
      await setRole(transaction, 'account_executor');
      return dispatchAccount(
        request,
        transaction,
        dependencies,
        session,
        reauthSession,
      );
    });
    return response(
      {
        data: result.data,
        ...(result.next_cursor === undefined
          ? {}
          : { next_cursor: result.next_cursor }),
        request_id: id,
      },
      result.status,
      id,
      result.headers,
    );
  } catch (error) {
    const fault = mapSqlFault(error);
    return response(
      { error: { code: fault.code, message: fault.code }, request_id: id },
      fault.status,
      id,
    );
  }
}

function runtimeDependencies(): AccountApiDependencies {
  const checkoutKeyVersion = Number.parseInt(
    Deno.env.get('BILLING_CHECKOUT_KEY_VERSION') ?? '',
    10,
  );
  return {
    checkoutSecret: Deno.env.get('BILLING_CHECKOUT_SECRET'),
    checkoutKeyVersion:
      Number.isSafeInteger(checkoutKeyVersion) && checkoutKeyVersion > 0
        ? checkoutKeyVersion
        : undefined,
    checkoutProviderAccountId: Deno.env.get('BILLING_PROVIDER_ACCOUNT_ID'),
  };
}

if (import.meta.main) {
  const port = Number.parseInt(Deno.env.get('ACCOUNT_API_PORT') ?? '8000', 10);
  const dependencies = runtimeDependencies();
  Deno.serve({ port }, (request) => handleRequest(request, dependencies));
}
