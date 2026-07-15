import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PANEL = readFileSync(
  resolve(process.cwd(), "src/components/LeadConversionOutreachPanel.tsx"),
  "utf8",
);
const DRAWER = readFileSync(resolve(process.cwd(), "src/components/LeadDetailDrawer.tsx"), "utf8");

describe("lead conversion outreach presenter", () => {
  it("is mounted in the lead drawer and review-gated", () => {
    expect(DRAWER).toContain("<LeadConversionOutreachPanel lead={lead} />");
    expect(PANEL).toContain("Review before sending");
    expect(PANEL).toContain("Nothing is sent or logged automatically");
    expect(PANEL).toContain("use the existing interaction log");
  });

  it("offers copy and local mail-client actions only", () => {
    expect(PANEL).toContain("navigator.clipboard.writeText");
    expect(PANEL).toContain("href={draft.mailtoHref}");
    expect(PANEL).toContain("Copy subject");
    expect(PANEL).toContain("Copy body");
    expect(PANEL).not.toMatch(/supabase|fetch\(|onLogInteraction|updateLead|email_logged/);
  });
});
