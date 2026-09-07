export const REDEMPTION_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ023456789';

export interface RedemptionCodeMaterial {
  readonly code: string;
  readonly codeHmac: string;
  readonly hmacKeyVersion: number;
  readonly codePrefix: string;
  readonly codeSuffix: string;
}

function randomCode(length: number): string {
  const result: string[] = [];
  const alphabetLength = REDEMPTION_CODE_ALPHABET.length;
  const rejectionLimit = 256 - (256 % alphabetLength);
  while (result.length < length) {
    const bytes = crypto.getRandomValues(
      new Uint8Array(length - result.length + 8),
    );
    for (const byte of bytes) {
      if (byte >= rejectionLimit) continue;
      result.push(REDEMPTION_CODE_ALPHABET[byte % alphabetLength]!);
      if (result.length === length) break;
    }
  }
  return result.join('');
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateRedemptionCodes(input: {
  readonly platformId: string;
  readonly hmacSecret: string;
  readonly hmacKeyVersion: number;
  readonly quantity: number;
  readonly length?: number;
}): Promise<readonly RedemptionCodeMaterial[]> {
  const length = input.length ?? 31;
  if (
    !input.platformId ||
    input.hmacSecret.length < 16 ||
    !Number.isInteger(input.hmacKeyVersion) ||
    input.hmacKeyVersion < 1 ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 1000 ||
    !Number.isInteger(length) ||
    length < 16 ||
    length > 128
  )
    throw new Error('INVALID_REDEMPTION_CODE_INPUT');

  return Promise.all(
    Array.from({ length: input.quantity }, async () => {
      const code = randomCode(length);
      const codeHmac = await hmacHex(
        input.hmacSecret,
        `redeem:v1:platform:${input.platformId}:key:${input.hmacKeyVersion}:code:${code}`,
      );
      return {
        code,
        codeHmac,
        hmacKeyVersion: input.hmacKeyVersion,
        codePrefix: code.slice(0, 4),
        codeSuffix: code.slice(-4),
      };
    }),
  );
}
