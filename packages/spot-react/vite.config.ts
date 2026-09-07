import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      tsconfigPath: './tsconfig.json',
      include: ['src'],
      pathsToAliases: false,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SpotReact',
      fileName: 'spot-react',
    },
    rollupOptions: {
      // React stays external so hooks consume the host app's instance.
      // spot-ui and Zustand are regular runtime dependencies but also stay
      // external so their implementations are not copied into this bundle.
      external: [
        '@orbs-network/spot-ui',
        'react',
        'react/jsx-runtime',
        /^zustand(?:\/.*)?$/,
      ],
      output: {
        banner: '"use client";',
        globals: {
          react: 'React',
          'react/jsx-runtime': 'jsxRuntime',
          '@orbs-network/spot-ui': 'SpotUI',
          zustand: 'Zustand',
          'zustand/vanilla': 'ZustandVanilla',
        },
      },
    },
  },
})
