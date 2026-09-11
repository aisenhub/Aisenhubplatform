/// <reference lib="deno.ns" />

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  );
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

export async function deriveCheckoutToken(input: {
  readonly secret: string;
  readonly keyVersion: number;
  readonly providerAccountId: string;
  readonly checkoutId: string;
}): Promise<{ readonly token: string; readonly digest: Uint8Array }> {
  if (
    !input.secret ||
    !Number.isInteger(input.keyVersion) ||
    input.keyVersion < 1
  )
    throw new Error('CHECKOUT_KEY_UNAVAILABLE');
  const canonical = [
    'aisen-checkout-v1',
    input.providerAccountId,
    input.checkoutId,
  ]
    .map((part) => `${part.length}:${part}`)
    .join('|');
  const mac = await hmacSha256(input.secret, canonical);
  const token = `AC_${input.keyVersion}_${bytesToBase64Url(mac)}`;
  return { token, digest: await sha256(token) };
}

export async function sha256Bytes(value: Uint8Array): Promise<Uint8Array> {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', copy));
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1)
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

/**
 * Reads an independently deployable billing stop switch. The default keeps
 * the current local behavior; production can stop one flow without disabling
 * the others. Only explicit false-like values disable a switch.
 */
export function billingSwitchEnabled(
  name: string,
  defaultValue = true,
): boolean {
  const value = Deno.env.get(name);
  if (value === undefined) return defaultValue;
  return !['0', 'false', 'off', 'disabled', 'no'].includes(
    value.trim().toLowerCase(),
  );
}
