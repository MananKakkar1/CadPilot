import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['replicad', 'replicad-opencascadejs'],
};

export default nextConfig;
