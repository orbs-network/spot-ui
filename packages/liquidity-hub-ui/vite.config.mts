import { defineConfig } from 'vite'
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";
import dts from "vite-plugin-dts";
import path from "path";
import version from 'vite-plugin-package-version';

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    "process.env": process.env,
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/lib/index.ts"),
      fileName: (format) => `main.${format}.js`,
      name: "main",
    },
  },
  plugins: [
    svgr(),
    tsconfigPaths(),
    version(),
    dts({
      insertTypesEntry: true,
      outDir: "dist/types",
      include: ["src/lib/**/*.*"],
    }),
  ],
});
