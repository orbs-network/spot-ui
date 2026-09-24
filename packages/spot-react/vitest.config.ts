import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests use workspace source; dist compatibility is checked by the web build.
export default defineConfig({
  resolve: {
    alias: {
      "@orbs-network/spot-ui": resolve(__dirname, "../spot-ui/src/index.ts"),
    },
  },
});
