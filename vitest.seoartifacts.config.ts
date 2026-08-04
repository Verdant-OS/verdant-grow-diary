import { defineConfig } from "vitest/config";
export default defineConfig({ root: "/dev-server", test: { environment: "node", globals: true, include: ["src/test/postbuild-seo-artifact-generation.test.ts"] } });
