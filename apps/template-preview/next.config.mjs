/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kit/ui', '@kit/shared'],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
