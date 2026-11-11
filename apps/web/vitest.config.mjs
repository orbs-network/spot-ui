import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL(".", import.meta.url)),
    "@orbs-network/spot-react/internal": fileURLToPath(new URL("../../packages/spot-react/src/internal.ts", import.meta.url)),
  } },
});
