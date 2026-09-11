/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  transpilePackages: ['@kit/ui', '@kit/shared', '@kit/account-auth-nextjs'],
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
