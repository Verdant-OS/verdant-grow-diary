import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["test/**/*.test.ts"],
    exclude: ["test/repeatability.worker.ts"],
    fileParallelism: false,
  },
});
