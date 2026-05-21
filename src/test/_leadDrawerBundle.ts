/**
 * Test-only helper: returns the combined source text of the Lead Detail
 * Drawer plus all of its extracted presenter section components.
 *
 * Tests that perform string-level inspection of the drawer (markup checks,
 * data-testid lookups, section header presence) should read this bundle so
 * the assertions keep working after the drawer was split into smaller
 * presenter components. This helper introduces no runtime behavior — it is
 * a pure file-read used inside vitest only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "..");

const DRAWER_FILES = [
  "components/LeadDetailDrawer.tsx",
  "components/LeadDetailHeader.tsx",
  "components/LeadDetailContactSection.tsx",
  "components/LeadDetailMetadataSection.tsx",
  "components/LeadDetailIntelligenceSection.tsx",
];

export function readLeadDetailDrawerBundle(): string {
  return DRAWER_FILES.map((p) => readFileSync(resolve(SRC, p), "utf8")).join("\n");
}
