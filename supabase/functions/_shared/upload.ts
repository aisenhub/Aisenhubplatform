export class UploadFault extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'PAYLOAD_TOO_LARGE'
      | 'UPLOAD_SIZE_MISMATCH'
      | 'STORAGE_UNAVAILABLE',
    readonly status: number,
  ) {
    super(code);
    this.name = 'UploadFault';
  }
}

export interface BoundedBody {
  readonly bytes: Uint8Array;
  readonly size: number;
}

function contentLength(request: Request): number | undefined {
  const value = request.headers.get('content-length');
  if (value === null) return undefined;
  if (!/^\d+$/u.test(value)) throw new UploadFault('INVALID_INPUT', 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new UploadFault('INVALID_INPUT', 400);
  return parsed;
}

export async function readBoundedBody(
  request: Request,
  limit: number,
  timeoutMs = 15_000,
): Promise<BoundedBody> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new UploadFault('INVALID_INPUT', 400);
  const declared = contentLength(request);
  if (declared !== undefined && declared > limit)
    throw new UploadFault('PAYLOAD_TOO_LARGE', 413);
  const encoding = request.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity')
    throw new UploadFault('INVALID_INPUT', 400);

  const reader = request.body?.getReader();
  if (!reader) throw new UploadFault('INVALID_INPUT', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: number | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void reader.cancel('upload receive timeout');
        reject(new UploadFault('STORAGE_UNAVAILABLE', 503));
      }, timeoutMs);
    });
    const read = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        if (size + value.byteLength > limit) {
          await reader.cancel('upload limit exceeded').catch(() => undefined);
          throw new UploadFault('PAYLOAD_TOO_LARGE', 413);
        }
        chunks.push(value);
        size += value.byteLength;
      }
    })();
    await Promise.race([read, timeout]);
    if (declared !== undefined && declared !== size)
      throw new UploadFault('UPLOAD_SIZE_MISMATCH', 400);
    if (size === 0) throw new UploadFault('INVALID_INPUT', 400);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, size };
  } catch (error) {
    if (error instanceof UploadFault) throw error;
    if ((error as { name?: string })?.name === 'AbortError')
      throw new UploadFault('STORAGE_UNAVAILABLE', 503);
    throw new UploadFault('STORAGE_UNAVAILABLE', 503);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    reader.releaseLock();
  }
}

export class UploadGate {
  private active = 0;
  private readonly accounts = new Map<string, number>();

  constructor(
    private readonly instanceLimit = 16,
    private readonly accountLimit = 2,
  ) {}

  tryAcquire(accountId: string): boolean {
    const accountActive = this.accounts.get(accountId) ?? 0;
    if (this.active >= this.instanceLimit || accountActive >= this.accountLimit)
      return false;
    this.active += 1;
    this.accounts.set(accountId, accountActive + 1);
    return true;
  }

  release(accountId: string): void {
    this.active = Math.max(0, this.active - 1);
    const accountActive = Math.max(0, (this.accounts.get(accountId) ?? 1) - 1);
    if (accountActive === 0) this.accounts.delete(accountId);
    else this.accounts.set(accountId, accountActive);
  }
}
