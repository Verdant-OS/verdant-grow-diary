import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

test("cross-module import.meta.env", () => {
  const meta = import.meta as any;
  meta.env.VITE_CROSS_TEST = "hello";
  
  // Read paddleConfig.ts source to check its import.meta
  const src = readFileSync("src/lib/paddleConfig.ts", "utf8");
  console.log("paddleConfig uses import.meta:", /import\.meta/.test(src));
  
  // Try importing and calling it
  import("@/lib/paddleConfig").then((mod) => {
    const cfg = mod.resolvePaddleConfig();
    console.log("config from imported module:", JSON.stringify(cfg));
  });
});
