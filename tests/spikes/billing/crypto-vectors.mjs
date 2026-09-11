import { createHash } from 'node:crypto';

const afdianCanonicalInput = '123params{"a":333}ts1624339905user_idabc';
const expectedAfdianMd5 = 'a4acc28b81598b7e5d84ebdc3e91710c';
const hmacMessage = 'The quick brown fox jumps over the lazy dog';
const expectedHmacSha256 =
  'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8';

const hex = (bytes) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const md5 = createHash('md5').update(afdianCanonicalInput).digest('hex');
if (md5 !== expectedAfdianMd5) {
  throw new Error(`MD5 vector mismatch: ${md5}`);
}

const hmacKey = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode('key'),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign'],
);
const signature = await crypto.subtle.sign(
  'HMAC',
  hmacKey,
  new TextEncoder().encode(hmacMessage),
);
if (hex(new Uint8Array(signature)) !== expectedHmacSha256) {
  throw new Error('HMAC-SHA256 vector mismatch');
}

console.log('PASS: MD5 Afdian canonical vector and HMAC-SHA256 vector');
