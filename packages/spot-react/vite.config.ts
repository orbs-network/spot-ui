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
      '@orbs-network/spot-ui': resolve(__dirname, '../spot-ui/src/index.ts'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SpotReact',
      fileName: 'spot-react',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', '@orbs-network/spot-ui'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
          '@orbs-network/spot-ui': 'SpotSDK',
        },
      },
    },
  },
})

