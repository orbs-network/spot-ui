import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      entryRoot: 'src',
      compilerOptions: { rootDir: resolve(__dirname) },
    }),
  ],
  build: {
    lib: {
      entry: {
        'spot-ui': resolve(__dirname, 'src/index.ts'),
        internal: resolve(__dirname, 'src/internal.ts'),
      },
      // Shared chunks keep telemetry state identical across public and internal imports.
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => entryName === 'spot-ui'
        ? format === 'es' ? 'spot-ui.js' : 'spot-ui.umd.cjs'
        : `internal.${format === 'es' ? 'js' : 'cjs'}`,
    },
  },
})

