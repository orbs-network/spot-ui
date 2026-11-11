import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { finalizeNodeDeclarations } from '../../scripts/node-compatible-declarations.mjs'

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      entryRoot: 'src',
      // Emit this package's declarations against the public SDK dependency.
      compilerOptions: { rootDir: resolve(__dirname), paths: {}, declarationMap: false },
      tsconfigPath: './tsconfig.json',
      include: ['src'],
      pathsToAliases: false,
      afterBuild: finalizeNodeDeclarations,
    }),
    {
      name: 'spot-react-client-boundary',
      enforce: 'post',
      generateBundle(_options, bundle) {
        // UMD places Rollup's banner inside its factory; frameworks read top-level directives.
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk' && chunk.isEntry && !/^(["'])use client\1;/.test(chunk.code)) {
            chunk.code = '"use client";\n' + chunk.code
          }
        }
      },
    },
  ],
  build: {
    lib: {
      entry: {
        'spot-react': resolve(__dirname, 'src/index.ts'),
        internal: resolve(__dirname, 'src/internal.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => entryName === 'spot-react'
        ? format === 'es' ? 'spot-react.js' : 'spot-react.umd.cjs'
        : `internal.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      // React stays external so hooks consume the host app's instance.
      // spot-ui and Zustand are regular runtime dependencies but also stay
      // external so their implementations are not copied into this bundle.
      external: [
        '@orbs-network/spot-ui',
        '@orbs-network/spot-ui/internal',
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
          '@orbs-network/spot-ui/internal': 'SpotUIInternal',
          zustand: 'Zustand',
          'zustand/vanilla': 'ZustandVanilla',
        },
      },
    },
  },
})
