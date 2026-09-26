export type AdminSecurityStatusPayload = {
  data?: { current_aal?: unknown };
  error?: { code?: unknown };
  request_id?: string | null;
};

export type AdminSecurityView =
  | { kind: 'unauthenticated' }
  | { kind: 'admin_required'; requestId: string | null }
  | { kind: 'aal1' }
  | { kind: 'aal2' }
  | {
      kind: 'unavailable';
      requestId: string | null;
      errorCode: string;
    };

export function resolveAdminSecurityView(
  response: Response,
  payload: AdminSecurityStatusPayload | null,
): AdminSecurityView {
  const requestId =
    response.headers.get('x-request-id') ?? payload?.request_id ?? null;

  if (response.status === 401) return { kind: 'unauthenticated' };
  if (response.status === 403 && payload?.error?.code === 'ADMIN_REQUIRED')
    return { kind: 'admin_required', requestId };
  if (response.status === 200 && payload?.data?.current_aal === 'aal1')
    return { kind: 'aal1' };
  if (response.status === 200 && payload?.data?.current_aal === 'aal2')
    return { kind: 'aal2' };

  return {
    kind: 'unavailable',
    requestId,
    errorCode:
      typeof payload?.error?.code === 'string'
        ? payload.error.code
        : `HTTP_${response.status}`,
  };
}
