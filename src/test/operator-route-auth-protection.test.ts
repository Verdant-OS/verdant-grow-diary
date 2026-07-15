// Operator/Customer route protection audit.
//
// Confirms via static inspection that:
//  - all operator (/operator/*, /diagnostics, /ingest-*, /pi-*, /imports/*,
//    /sensors/*, /actions, /admin/leads, /leads) routes live INSIDE the
//    AppShell <Route element={<AppShell />}> block, which calls
//    useRequireAuth and redirects unauthenticated users to /auth.
//  - public/Customer routes (/welcome, /pricing, /hardware-integrations,
//    /billing/:plan, /partners/csv-preview, /auth, /reset-password) live
//    OUTSIDE the AppShell block.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP = fs.readFileSync(
  path.resolve(__dirname, "../App.tsx"),
  "utf8",
);

// Split the file on the AppShell element open/close so we can classify
// each <Route path="..."/> as protected vs public.
const shellOpen = APP.indexOf("<Route element={<AppShell />}>");
expect(shellOpen).toBeGreaterThan(-1);

// Walk the JSX to find the matching </Route> for the AppShell wrapper.
// We track brace depth so `<RequireOperatorRole />` inside an `element={...}`
// attribute is not mistaken for a self-closing tag boundary.
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
function findMatchingShellClose(src: string, openIdx: number): number {
  const startEnd = tagOpenEnd(src, openIdx);
  let depth = 1;
  let i = startEnd + 1;
  while (i < src.length && depth > 0) {
    const nextOpen = src.indexOf("<Route", i);
    const nextClose = src.indexOf("</Route>", i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const end = tagOpenEnd(src, nextOpen);
      if (end === -1) return -1;
      if (src[end - 1] !== "/") depth += 1;
      i = end + 1;
    } else {
      depth -= 1;
      if (depth === 0) return nextClose;
      i = nextClose + "</Route>".length;
    }
  }
  return -1;
}
const shellClose = findMatchingShellClose(APP, shellOpen);
expect(shellClose).toBeGreaterThan(shellOpen);

const protectedBlock = APP.slice(shellOpen, shellClose);
const publicBlockBefore = APP.slice(0, shellOpen);
const publicBlockAfter = APP.slice(shellClose);
const publicBlock = publicBlockBefore + publicBlockAfter;

function pathsIn(src: string): string[] {
  return [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

const PROTECTED = new Set(pathsIn(protectedBlock));
const PUBLIC = new Set(pathsIn(publicBlock));

const REQUIRED_PROTECTED = [
  "/operator/ecowitt",
  "/operator/one-tent-proof-record",
  "/operator/demo-preview",
  "/diagnostics",
  "/pi-ingest-status",
  "/ingest-inspector",
  "/sensors",
  "/sensors/ecowitt-audit",
  "/sensors/ingest-normalizer",
  
  "/actions",
  "/admin/leads",
  "/leads",
  "/settings",
];

const REQUIRED_PUBLIC = [
  "/auth",
  "/reset-password",
  "/welcome",
  "/pricing",
  "/hardware-integrations",
  "/quick-log",
];

describe("Operator routes require authenticated AppShell", () => {
  for (const p of REQUIRED_PROTECTED) {
    it(`${p} is mounted inside the AppShell-protected block`, () => {
      expect(PROTECTED.has(p)).toBe(true);
      expect(PUBLIC.has(p)).toBe(false);
    });
  }
});

describe("Customer/public routes stay accessible without auth", () => {
  for (const p of REQUIRED_PUBLIC) {
    it(`${p} is mounted in the public block (NOT under AppShell)`, () => {
      expect(PUBLIC.has(p)).toBe(true);
      expect(PROTECTED.has(p)).toBe(false);
    });
  }
});

describe("AppShell protected boundary", () => {
  it("AppShell uses useRequireAuth to redirect to /auth", () => {
    const shell = fs.readFileSync(
      path.resolve(__dirname, "../components/AppShell.tsx"),
      "utf8",
    );
    expect(shell).toMatch(/useRequireAuth\(\s*["']\/auth["']\s*\)/);
  });

  it("useRequireAuth navigates unauthenticated users to /auth (replace)", () => {
    const hook = fs.readFileSync(
      path.resolve(__dirname, "../hooks/useRequireAuth.ts"),
      "utf8",
    );
    expect(hook).toMatch(/nav\(redirectTo,\s*\{\s*replace:\s*true\s*\}\)/);
    expect(hook).toMatch(/redirectTo:\s*string\s*=\s*"\/auth"/);
  });

  it("does not reference service_role or pull_request_target", () => {
    expect(APP).not.toMatch(/service_role/i);
    expect(APP).not.toMatch(/pull_request_target/i);
  });
});
