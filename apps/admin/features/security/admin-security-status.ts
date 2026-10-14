export type AdminSecurityStatusPayload = {
  data?: {
    membership_state?: unknown;
    current_aal?: unknown;
    verified_totp_count?: unknown;
    active_admin_count?: unknown;
    member_count?: unknown;
    readiness_healthy?: unknown;
  };
  error?: { code?: unknown };
  request_id?: string | null;
};

export type AdminSecurityView =
  | { kind: 'unauthenticated' }
  | { kind: 'admin_required'; requestId: string | null }
  | { kind: 'pending'; currentAal: 'aal1' | 'aal2'; verifiedTotpCount: number }
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
  if (
    response.status === 200 &&
    payload?.data?.membership_state === 'pending' &&
    (payload.data.current_aal === 'aal1' || payload.data.current_aal === 'aal2')
  )
    return {
      kind: 'pending',
      currentAal: payload.data.current_aal,
      verifiedTotpCount: Number(payload.data.verified_totp_count ?? 0),
    };
  if (
    response.status === 200 &&
    payload?.data?.membership_state === 'active' &&
    payload.data.current_aal === 'aal1'
  )
    return { kind: 'aal1' };
  if (
    response.status === 200 &&
    payload?.data?.membership_state === 'active' &&
    payload.data.current_aal === 'aal2'
  )
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
