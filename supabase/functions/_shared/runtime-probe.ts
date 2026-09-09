import {
  success,
  type DomainResult,
} from '../../../packages/domain/src/index.ts';

export interface RuntimeProbeResult {
  readonly runtime: 'node' | 'deno';
  readonly sharedBoundary: 'packages/domain';
}

export function runtimeProbe(
  runtime: RuntimeProbeResult['runtime'],
): DomainResult<RuntimeProbeResult> {
  return success({ runtime, sharedBoundary: 'packages/domain' });
}
