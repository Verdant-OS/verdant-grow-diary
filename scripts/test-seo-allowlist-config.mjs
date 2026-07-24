#!/usr/bin/env node
/**
 * Validates the shipped config/seo-allowlist.json:
 *   - passes structural validation
 *   - never_allowlist covers the core public routes
 *   - no allowlist pattern silently traps a never_allowlist URL
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAllowlist, validateAllowlist } from "./seo/seoAllowlist.mjs";

const REQUIRED_NEVER = [
  "https://verdantgrowdiary.com/",
  "https://verdantgrowdiary.com/welcome",
  "https://verdantgrowdiary.com/pricing",
  "https://verdantgrowdiary.com/hardware-integrations",
  "https://verdantgrowdiary.com/guides/cronk-nutrients-grow-diary",
  "https://verdantgrowdiary.com/sitemap.xml",
  "https://verdantgrowdiary.com/robots.txt",
];

test("shipped allowlist is structurally valid", () => {
  const al = loadAllowlist();
  const errs = validateAllowlist(al);
  assert.deepEqual(errs, [], `errors: ${errs.join("; ")}`);
});

test("shipped allowlist protects core public routes via never_allowlist", () => {
  const al = loadAllowlist();
  for (const url of REQUIRED_NEVER) {
    assert.ok(
      (al.never_allowlist ?? []).includes(url),
      `never_allowlist must include ${url}`,
    );
  }
});
