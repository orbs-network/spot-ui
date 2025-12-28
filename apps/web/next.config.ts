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
    if (isDev) {
      config.resolve.alias['@orbs-network/spot-react'] = path.resolve(__dirname, '../../packages/spot-react/src');
      config.resolve.alias['@orbs-network/spot-ui'] = path.resolve(__dirname, '../../packages/spot-ui/src');
      config.resolve.alias['@orbs-network/liquidity-hub-sdk'] = path.resolve(__dirname, '../../packages/liquidity-hub-ui/src/lib');
    }
    return config;
  },
  turbopack: {
    resolveAlias: {
      '@orbs-network/spot-react': '../../packages/spot-react/src',
      '@orbs-network/spot-ui': '../../packages/spot-ui/src',
      '@orbs-network/liquidity-hub-sdk': '../../packages/liquidity-hub-ui/src/lib',
    },
  },
};

export default nextConfig;
