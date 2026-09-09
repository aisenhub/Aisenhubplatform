export interface StorageObjectInfo {
  readonly size: number;
  readonly etag: string | null;
}

export interface StorageAdapter {
  putImmutable(input: {
    readonly bucket: 'platform-config-files';
    readonly path: string;
    readonly body: Uint8Array;
    readonly contentType: string;
    readonly timeoutMs: number;
  }): Promise<{ readonly providerRequestId: string | null }>;
  getInfo(input: {
    readonly bucket: 'platform-config-files';
    readonly path: string;
    readonly timeoutMs: number;
  }): Promise<StorageObjectInfo>;
  download(input: {
    readonly bucket: 'platform-config-files';
    readonly path: string;
    readonly timeoutMs: number;
  }): Promise<Response>;
  remove(input: {
    readonly bucket: 'platform-config-files';
    readonly path: string;
    readonly timeoutMs: number;
  }): Promise<void>;
}

function storageUrl(): string {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/u, '');
  if (!url) throw new Error('STORAGE_NOT_CONFIGURED');
  return `${url}/storage/v1/object`;
}

function storageSecret(): string {
  const secret = Deno.env.get('SUPABASE_SECRET_KEY');
  if (!secret) throw new Error('STORAGE_NOT_CONFIGURED');
  return secret;
}

function objectUrl(bucket: string, path: string): string {
  const safePath = path.split('/').map(encodeURIComponent).join('/');
  return `${storageUrl()}/${encodeURIComponent(bucket)}/${safePath}`;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function headers(): Headers {
  const secret = storageSecret();
  return new Headers({
    apikey: secret,
    Authorization: `Bearer ${secret}`,
  });
}

export function createSupabaseStorageAdapter(): StorageAdapter {
  return {
    async putImmutable({ bucket, path, body, contentType, timeoutMs }) {
      const requestHeaders = headers();
      requestHeaders.set('content-type', contentType);
      requestHeaders.set('x-upsert', 'false');
      const bodyBuffer = new ArrayBuffer(body.byteLength);
      new Uint8Array(bodyBuffer).set(body);
      let response: Response;
      try {
        response = await fetchWithTimeout(
          objectUrl(bucket, path),
          { method: 'POST', headers: requestHeaders, body: bodyBuffer },
          timeoutMs,
        );
      } catch {
        throw new Error('PROVIDER_TIMEOUT');
      }
      if (!response.ok) {
        const error = new Error('STORAGE_PUT_FAILED');
        (error as { status?: number }).status = response.status;
        throw error;
      }
      return {
        providerRequestId:
          response.headers.get('x-request-id') ??
          response.headers.get('x-amz-request-id'),
      };
    },

    async getInfo({ bucket, path, timeoutMs }) {
      const requestHeaders = headers();
      let response: Response;
      try {
        response = await fetchWithTimeout(
          objectUrl(bucket, path),
          { method: 'HEAD', headers: requestHeaders },
          timeoutMs,
        );
      } catch {
        throw new Error('PROVIDER_TIMEOUT');
      }
      if (!response.ok) {
        const error = new Error('STORAGE_INFO_FAILED');
        (error as { status?: number }).status = response.status;
        throw error;
      }
      const size = Number(response.headers.get('content-length'));
      if (!Number.isSafeInteger(size) || size < 1)
        throw new Error('STORAGE_INVALID_SIZE');
      return { size, etag: response.headers.get('etag') };
    },

    async download({ bucket, path, timeoutMs }) {
      const requestHeaders = headers();
      try {
        return await fetchWithTimeout(
          objectUrl(bucket, path),
          { method: 'GET', headers: requestHeaders },
          timeoutMs,
        );
      } catch {
        throw new Error('PROVIDER_TIMEOUT');
      }
    },

    async remove({ bucket, path, timeoutMs }) {
      const requestHeaders = headers();
      let response: Response;
      try {
        response = await fetchWithTimeout(
          objectUrl(bucket, path),
          { method: 'DELETE', headers: requestHeaders },
          timeoutMs,
        );
      } catch {
        throw new Error('PROVIDER_TIMEOUT');
      }
      if (!response.ok && response.status !== 404)
        throw new Error('STORAGE_REMOVE_FAILED');
    },
  };
}
