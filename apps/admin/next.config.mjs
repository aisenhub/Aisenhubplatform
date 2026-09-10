/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  transpilePackages: ['@kit/ui', '@kit/shared'],
};

export default nextConfig;
