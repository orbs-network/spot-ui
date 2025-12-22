import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      tsconfigPath: './tsconfig.json',
    }),
  ],
  resolve: {
    alias: {
      '@orbs-network/spot-sdk': resolve(__dirname, '../spot-sdk/src/index.ts'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SpotReact',
      fileName: 'spot-react',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', '@orbs-network/spot-sdk'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
          '@orbs-network/spot-sdk': 'SpotSDK',
        },
      },
    },
  },
})

