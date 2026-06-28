/**
 * Operator role gate — static audit.
 *
 * Confirms every `/operator/*` Route in src/App.tsx is mounted inside a
 * `<Route element={<RequireOperatorRole />}>` block, so role-restricted
 * surfaces require server-side has_role('operator') in addition to auth.
 *
 * Also confirms:
 *  - RequireOperatorRole uses useHasRole("operator") (server-side RPC).
 *  - Public Customer/marketing routes remain unwrapped.
 *  - The guard never references service_role or token internals.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
const GUARD = fs.readFileSync(
  path.resolve(__dirname, "../components/RequireOperatorRole.tsx"),
  "utf8",
);

function extractOperatorBlock(): string {
  const open = APP.indexOf("<Route element={<RequireOperatorRole />}>");
  expect(open).toBeGreaterThan(-1);
  // Find the matching </Route> at the end of that nested block. Count nested
  // <Route ...> opens that DO NOT self-close until we hit a close that
  // balances back to zero depth.
  let depth = 1;
  let i = APP.indexOf(">", open) + 1;
  while (i < APP.length && depth > 0) {
    const nextOpen = APP.indexOf("<Route", i);
    const nextClose = APP.indexOf("</Route>", i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // self-closing route (`/>`) does not change depth.
      const tagEnd = APP.indexOf(">", nextOpen);
      const tag = APP.slice(nextOpen, tagEnd + 1);
      if (!tag.endsWith("/>")) depth += 1;
      i = tagEnd + 1;
    } else {
      depth -= 1;
      i = nextClose + "</Route>".length;
    }
  }
  return APP.slice(open, i);
}

const OPERATOR_BLOCK = extractOperatorBlock();
const ALL_OPERATOR_PATHS = [...APP.matchAll(/path="(\/operator\/[^"]+)"/g)].map(
  (m) => m[1],
);
const GATED_OPERATOR_PATHS = [
  ...OPERATOR_BLOCK.matchAll(/path="(\/operator\/[^"]+)"/g),
].map((m) => m[1]);

describe("Slice A — Operator routes are role-gated", () => {
  it("App.tsx imports the RequireOperatorRole guard", () => {
    expect(APP).toMatch(
      /import\s+RequireOperatorRole\s+from\s+["']\.\/components\/RequireOperatorRole["']/,
    );
  });

  it("at least one /operator/* route is present (sanity)", () => {
    expect(ALL_OPERATOR_PATHS.length).toBeGreaterThan(0);
  });

  it.each(ALL_OPERATOR_PATHS)(
    "%s is mounted inside the RequireOperatorRole wrapper",
    (p) => {
      expect(GATED_OPERATOR_PATHS).toContain(p);
    },
  );

  it("no /operator/* route is left outside the role-gated block", () => {
    const ungated = ALL_OPERATOR_PATHS.filter(
      (p) => !GATED_OPERATOR_PATHS.includes(p),
    );
    expect(ungated).toEqual([]);
  });
});

describe("Slice A — RequireOperatorRole guard contract", () => {
  it("delegates to server-side useHasRole('operator')", () => {
    expect(GUARD).toMatch(/useHasRole\(\s*["']operator["']\s*\)/);
  });

  it("renders <Outlet /> only when role status is granted", () => {
    expect(GUARD).toMatch(/status\s*!==?\s*["']granted["']/);
    expect(GUARD).toMatch(/<Outlet\s*\/>/);
  });

  it("does not reference service_role, tokens, or raw payloads", () => {
    expect(GUARD).not.toMatch(/service_role/i);
    expect(GUARD).not.toMatch(/access_token|bearer|raw_payload/i);
  });
});

describe("Slice A — Public/customer routes remain unaffected", () => {
  const PUBLIC = [
    "/auth",
    "/welcome",
    "/pricing",
    "/hardware-integrations",
    "/billing/:plan",
  ];
  it.each(PUBLIC)("%s is not wrapped by RequireOperatorRole", (p) => {
    expect(OPERATOR_BLOCK).not.toContain(`path="${p}"`);
  });
});
