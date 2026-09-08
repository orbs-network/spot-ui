import path from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/lib/index.ts"),
      fileName: (format) => (format === "es" ? "main.es.js" : "main.umd.cjs"),
      name: "LiquidityHubClient",
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      outDir: "dist/types",
      include: ["src/lib/**/*.*"],
    }),
  ],
});
