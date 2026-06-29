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

function tagOpenEnd(src: string, openIdx: number): number {
  let i = openIdx + 1;
  let braces = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    else if (ch === ">" && braces === 0) return i;
    i += 1;
  }
  return -1;
}
function extractOperatorBlock(): string {
  const open = APP.indexOf("<Route element={<RequireOperatorRole />}>");
  expect(open).toBeGreaterThan(-1);
  const startEnd = tagOpenEnd(APP, open);
  let depth = 1;
  let i = startEnd + 1;
  while (i < APP.length && depth > 0) {
    const nextOpen = APP.indexOf("<Route", i);
    const nextClose = APP.indexOf("</Route>", i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const end = tagOpenEnd(APP, nextOpen);
      if (end === -1) break;
      if (APP[end - 1] !== "/") depth += 1;
      i = end + 1;
    } else {
      depth -= 1;
      if (depth === 0) return APP.slice(open, nextClose);
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

describe("Slice A — Denied state copy is calm and leak-free", () => {
  it("uses the approved three-line copy", () => {
    expect(GUARD).toContain(
      "Signed in, but this account does not have operator access.",
    );
    expect(GUARD).toContain("Use an operator-role account for this preview.");
    expect(GUARD).toContain("No operator data was loaded.");
  });

  it("leaks no internal identifiers or auth internals in the denied JSX", () => {
    // Extract only the denied-state JSX block (between the status check and
    // the closing `);`), so source comments/imports above don't pollute the
    // leak check.
    const start = GUARD.indexOf('data-testid="require-operator-denied"');
    expect(start).toBeGreaterThan(-1);
    const end = GUARD.indexOf("return <Outlet", start);
    const denied = GUARD.slice(start, end);
    expect(denied).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    for (const banned of [
      "user_roles",
      "has_role",
      "service_role",
      "jwt",
      "auth.uid",
      "token",
    ]) {
      expect(denied.toLowerCase()).not.toContain(banned.toLowerCase());
    }
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
