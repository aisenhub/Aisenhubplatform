import { NextRequest, NextResponse } from 'next/server';

import {
  authorizeAdminMfaFactorDeletion,
  config,
  finalizeAdminMfaFactorDeletion,
  errorBody,
  hasValidCsrf,
  hasValidOrigin,
  responseBody,
  sessionGate,
  terminalClear,
} from '../../../_lib';
import {
  authCookieNames,
  createRequestAuthClient,
  listMfaFactors,
  refreshAuthSession,
  setRequestAuthSession,
  unenrollMfaFactor,
  writeAuthSessionCookies,
  type AuthCookieWriter,
} from '../../../../../_lib/auth/server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ factorId: string }> };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function accountApiUrl(): string {
  const value = process.env.ACCOUNT_API_URL?.replace(/\/$/u, '');
  if (!value) throw new Error('AUTH_NOT_CONFIGURED');
  return value;
}

function mappedAuthorizationError(code: string, status: number): NextResponse {
  if (code === 'MFA_REQUIRED') return errorBody('MFA_REQUIRED', 403);
  if (code === 'RECENT_MFA_REQUIRED')
    return errorBody('RECENT_MFA_REQUIRED', 403);
  if (code === 'MFA_FACTOR_FLOOR_REQUIRED')
    return errorBody('MFA_FACTOR_FLOOR_REQUIRED', 409);
  if (code === 'OPERATION_IN_PROGRESS')
    return errorBody('OPERATION_IN_PROGRESS', 409);
  if (code === 'RESOURCE_NOT_FOUND')
    return errorBody('RESOURCE_NOT_FOUND', 404);
  if (status === 401) return errorBody('UNAUTHORIZED', 401);
  return errorBody('AUTHORIZATION_UNAVAILABLE', status >= 500 ? 503 : 403);
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const runtimeConfig = config();
    if (
      !hasValidOrigin(request, runtimeConfig.origin) ||
      !hasValidCsrf(request)
    )
      return errorBody('INVALID_INPUT', 403);

    const { factorId } = await context.params;
    if (!UUID.test(factorId)) return errorBody('INVALID_INPUT', 400);

    const gate = sessionGate(request);
    if (!gate.ok) return errorBody('UNAUTHORIZED', 401);
    const names = authCookieNames('admin');
    const accessToken = request.cookies.get(names.access)?.value;
    const refreshToken = request.cookies.get(names.refresh)?.value;
    const recentProofId = request.cookies.get(names.recentProof)?.value;
    if (!accessToken || !refreshToken) return errorBody('UNAUTHORIZED', 401);
    if (!recentProofId || !UUID.test(recentProofId))
      return errorBody('RECENT_MFA_REQUIRED', 403);

    const client = createRequestAuthClient(runtimeConfig);
    const sessionResult = await setRequestAuthSession(client, {
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    const currentSession = sessionResult.data.session;
    if (sessionResult.error || !currentSession)
      return errorBody('UNAUTHORIZED', 401);

    const factorResult = await listMfaFactors(client);
    if (factorResult.error) return errorBody('AUTHORIZATION_UNAVAILABLE', 503);
    const target = (factorResult.data.totp ?? []).find(
      (factor) => factor.id === factorId && factor.status === 'verified',
    );
    if (!target) return errorBody('RESOURCE_NOT_FOUND', 404);

    const operationId = crypto.randomUUID();
    const centralUrl = accountApiUrl();
    const authorization = await authorizeAdminMfaFactorDeletion({
      accountApiUrl: centralUrl,
      accessToken: currentSession.access_token,
      recentProofId,
      factorId,
      operationId,
    });
    if (!authorization.ok) {
      const response = mappedAuthorizationError(
        authorization.code,
        authorization.status,
      );
      if (
        authorization.code === 'AUTHORIZATION_UNAVAILABLE' ||
        authorization.status >= 500
      )
        response.cookies.delete(names.recentProof);
      return response;
    }

    let providerResult: Awaited<ReturnType<typeof unenrollMfaFactor>>;
    try {
      providerResult = await unenrollMfaFactor(client, factorId);
    } catch {
      const response = errorBody('MFA_FACTOR_RESULT_UNKNOWN', 503);
      response.cookies.delete(names.recentProof);
      return response;
    }

    if (providerResult.error) {
      const observed = await listMfaFactors(client);
      if (observed.error) {
        const response = errorBody('MFA_FACTOR_RESULT_UNKNOWN', 503);
        response.cookies.delete(names.recentProof);
        return response;
      }
      const stillPresent = (observed.data.totp ?? []).some(
        (factor) => factor.id === factorId && factor.status === 'verified',
      );
      if (stillPresent) {
        const finalization = await finalizeAdminMfaFactorDeletion({
          accountApiUrl: centralUrl,
          accessToken: currentSession.access_token,
          factorId,
          operationId: authorization.operationId,
          result: 'failed',
          errorCode: providerResult.error.code ?? 'provider_rejected',
        });
        if (!finalization.ok) {
          const response = errorBody('MFA_FACTOR_RESULT_UNKNOWN', 503);
          response.cookies.delete(names.recentProof);
          return response;
        }
        const status =
          providerResult.error.status === 429
            ? 429
            : providerResult.error.status && providerResult.error.status >= 500
              ? 503
              : 409;
        const response = errorBody(
          status === 429
            ? 'RATE_LIMITED'
            : status === 503
              ? 'AUTHORIZATION_UNAVAILABLE'
              : 'MFA_FACTOR_DELETE_FAILED',
          status,
        );
        response.cookies.delete(names.recentProof);
        return response;
      }
    }

    const finalization = await finalizeAdminMfaFactorDeletion({
      accountApiUrl: centralUrl,
      accessToken: currentSession.access_token,
      factorId,
      operationId: authorization.operationId,
      result: 'completed',
    });
    if (!finalization.ok) {
      const response = errorBody('MFA_FACTOR_RESULT_UNKNOWN', 503);
      response.cookies.delete(names.recentProof);
      return response;
    }

    const refreshResult = await refreshAuthSession(client, refreshToken);
    const refreshedSession = refreshResult.data.session;
    const response = responseBody({
      deleted: true,
      factor_id: factorId,
      operation_id: authorization.operationId,
      session_state: refreshedSession ? 'refreshed' : 'reauth_required',
    });
    response.cookies.delete(names.recentProof);
    if (refreshedSession) {
      writeAuthSessionCookies({
        writer: response.cookies as unknown as AuthCookieWriter,
        session: refreshedSession,
        secure: process.env.NODE_ENV === 'production',
        prefix: 'admin',
        csrfToken: request.cookies.get(names.csrf)?.value,
      });
    } else {
      terminalClear(response, process.env.NODE_ENV === 'production');
    }
    return response;
  } catch {
    return errorBody('AUTHORIZATION_UNAVAILABLE', 503);
  }
}
