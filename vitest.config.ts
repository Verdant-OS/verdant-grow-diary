import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [
    {
      name: "strip-shebang",
      transform(code, id) {
        if (id.endsWith(".mjs") && code.startsWith("#!")) {
          return { code: code.replace(/^#![^\n]*\n/, ""), map: null };
        }
      },
    },
    react(),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
