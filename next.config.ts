import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['replicad', 'replicad-opencascadejs'],
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // replicad-opencascadejs's emscripten bundle has a Node-only code path that does
      // `import("node:module")`, guarded at runtime but still statically resolved by
      // webpack for the browser/worker build. It never executes outside Node, so it's safe to ignore.
      config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^node:module$/ }));
    }
    return config;
  },
};

export default nextConfig;
