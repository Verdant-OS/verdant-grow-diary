import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("rebuilds the committed MCP bundle from current shared source without changing it", () => {
  const path = resolve("supabase/functions/mcp/index.ts");
  const before = readFileSync(path, "utf8");
  const receipt = JSON.parse(
    execFileSync(process.execPath, ["scripts/sync-mcp-edge-bundle.mjs", "--check"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 20_000,
    }),
  );
  expect(receipt).toEqual({
    mode: "--check",
    matchedBefore: true,
    sha256: createHash("sha256").update(before.replace(/\r\n/g, "\n")).digest("hex"),
  });
  expect(readFileSync(path, "utf8")).toBe(before);
}, 25_000);
