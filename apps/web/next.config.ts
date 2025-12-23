import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: [
    'pino',
    'thread-stream',
  ],
  transpilePackages: ['@orbs-network/spot-react', '@orbs-network/spot-ui', '@orbs-network/liquidity-hub-sdk'],
  webpack: (config) => {
    // Only alias to source in development for hot reload
    // Note: liquidity-hub-sdk doesn't work with Turbopack - uses built dist
    if (isDev) {
      config.resolve.alias['@orbs-network/spot-react'] = path.resolve(__dirname, '../../packages/spot-react/src');
      config.resolve.alias['@orbs-network/spot-ui'] = path.resolve(__dirname, '../../packages/spot-ui/src');
      // liquidity-hub-sdk uses dist/ - Turbopack can't compile its source
    }
    return config;
  },
  turbopack: {
    resolveAlias: {
      '@orbs-network/spot-react': '../../packages/spot-react/src',
      '@orbs-network/spot-ui': '../../packages/spot-ui/src',
      // liquidity-hub-sdk uses dist/ - Turbopack can't compile its source
    },
  },
};

export default nextConfig;
