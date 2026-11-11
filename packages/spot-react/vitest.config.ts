import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@orbs-network/spot-ui/internal", replacement: fileURLToPath(new URL("../spot-ui/src/internal.ts", import.meta.url)) },
      { find: "@orbs-network/spot-ui", replacement: fileURLToPath(new URL("../spot-ui/src/index.ts", import.meta.url)) },
    ],
  },
});
