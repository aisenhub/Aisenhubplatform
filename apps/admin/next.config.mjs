const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join('; ');

export const ADMIN_SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  },
  {
    key: 'Content-Security-Policy-Report-Only',
    value: contentSecurityPolicyReportOnly,
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  transpilePackages: ['@kit/ui', '@kit/shared', '@kit/domain'],
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [{ source: '/:path*', headers: ADMIN_SECURITY_HEADERS }];
  },
};

export default nextConfig;
