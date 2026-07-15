import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CARD = readFileSync(
  resolve(process.cwd(), "src/components/SubscriberActivationCard.tsx"),
  "utf8",
);
const PAGE = readFileSync(resolve(process.cwd(), "src/pages/OperatorSubscriberGrowth.tsx"), "utf8");

describe("subscriber activation card", () => {
  it("renders the aggregate activation funnel on the operator dashboard", () => {
    expect(PAGE).toContain("<SubscriberActivationCard counts={snapshot.counts} />");
    for (const label of [
      "Paid core-loop activation",
      "With grow",
      "With tent",
      "With plant",
      "First log or sensor",
      "Core activated",
    ]) {
      expect(CARD).toContain(label);
    }
  });

  it("contains no direct database reads, writes, or subscriber identifiers", () => {
    expect(CARD).not.toMatch(/supabase|\.from\(|fetch\(|user_id|email|provider_/);
    expect(CARD).toContain("Activity never grants or proves an entitlement");
  });
});
