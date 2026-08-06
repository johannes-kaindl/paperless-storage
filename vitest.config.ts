import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    // Nicht optional: mit dem vitest-1.6-Default `threads` crasht der CJS-Preparser
    // unter Nebenlaeufigkeit, sobald der obsidian-Mock re-exportiert (gemessen in
    // image-to-markdown: threads 4/30 Crashes, forks 0/30).
    pool: "forks",
  },
  resolve: { alias: { obsidian: path.resolve(__dirname, "./tests/__mocks__/obsidian.ts") } },
});
