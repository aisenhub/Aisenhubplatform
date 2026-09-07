export type PlatformStatus = 'active' | 'disabled';

export type AccountStatus = 'active' | 'suspended' | 'closed';

export interface RequestContext {
  readonly requestId: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly platformId?: string;
}

export interface Principal {
  readonly userId: string;
  readonly platformId: string;
  readonly platformStatus: PlatformStatus;
  readonly accountId?: string;
  readonly accountStatus?: AccountStatus;
  readonly authorization:
    | 'allowed'
    | 'not_activated'
    | 'suspended'
    | 'closed'
    | 'platform_disabled';
}

export type { DomainError, DomainErrorCode, DomainResult } from './errors.ts';
export { failure, invalidRequest, success } from './errors.ts';
export { isUuid, requireNonEmpty, requireUuid } from './validation.ts';
