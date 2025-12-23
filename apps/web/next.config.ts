import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: [
    'pino',
    'thread-stream',
  ],
  transpilePackages: ['@orbs-network/spot-react', '@orbs-network/spot-ui'],
  webpack: (config) => {
    // Only alias to source in development for hot reload
    if (isDev) {
      config.resolve.alias['@orbs-network/spot-react'] = path.resolve(__dirname, '../../packages/spot-react/src');
      config.resolve.alias['@orbs-network/spot-ui'] = path.resolve(__dirname, '../../packages/spot-ui/src');
    }
    return config;
  },
  // Turbopack aliases only apply in dev mode anyway
  turbopack: {
    resolveAlias: {
      '@orbs-network/spot-react': '../../packages/spot-react/src',
      '@orbs-network/spot-ui': '../../packages/spot-ui/src',
    },
  },
};

export default nextConfig;
