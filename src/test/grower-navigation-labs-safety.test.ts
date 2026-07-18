import { describe, expect, it } from "vitest";

import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  LABS_NAVIGATION_DESTINATIONS,
  type GrowerNavigationDestination,
} from "@/lib/growerNavigationRules";
import {
  readDesktopGrowerNavigationSource,
  readMobileGrowerNavigationSource,
} from "@/test/utils/growerNavigationSource";

const EXPECTED_LABS_DESTINATIONS = [
  { id: "phenoHunt", to: "/pheno-hunts", label: "Pheno Hunt" },
  { id: "breedingPrograms", to: "/breeding", label: "Breeding Programs" },
  { id: "lineageRepair", to: "/grow-lineage", label: "Lineage Repair" },
  {
    id: "agentIntegrations",
    to: "/settings/agent-integrations",
    label: "Agent Integrations",
  },
  { id: "aiSessions", to: "/doctor/sessions", label: "AI Sessions" },
] as const satisfies readonly GrowerNavigationDestination[];

interface CandidateDestination {
  id: string;
  to: string;
  label: string;
}

function auditLabsDestinations(destinations: readonly CandidateDestination[]): string[] {
  const findings: string[] = [];
  const expectedById = new Map(EXPECTED_LABS_DESTINATIONS.map((item) => [item.id, item]));
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();

  if (destinations.length !== EXPECTED_LABS_DESTINATIONS.length) {
    findings.push("Labs must contain exactly the approved destination set");
  }

  destinations.forEach((item) => {
    const expected = expectedById.get(item.id as (typeof EXPECTED_LABS_DESTINATIONS)[number]["id"]);
    if (!expected || expected.to !== item.to || expected.label !== item.label) {
      findings.push(`Unapproved Labs destination: ${item.id}:${item.to}:${item.label}`);
    }
    if (seenIds.has(item.id) || seenPaths.has(item.to)) {
      findings.push(`Duplicate Labs destination: ${item.id}:${item.to}`);
    }
    seenIds.add(item.id);
    seenPaths.add(item.to);

    const route = APP_ROUTES.find((candidate) => candidate.path === item.to);
    if (route?.access !== "auth") {
      findings.push(`Labs destination is not an authenticated grower route: ${item.to}`);
    }
  });

  return findings;
}

describe("More -> Labs navigation safety", () => {
  it("keeps the shared manifest byte-for-byte equivalent to the approved Phase 1 set", () => {
    expect(LABS_NAVIGATION_DESTINATIONS).toEqual(EXPECTED_LABS_DESTINATIONS);
    expect(auditLabsDestinations(LABS_NAVIGATION_DESTINATIONS)).toEqual([]);
  });

  it("makes the shared manifest part of both desktop and mobile static-scan closures", () => {
    const desktop = readDesktopGrowerNavigationSource();
    const mobile = readMobileGrowerNavigationSource();

    expect(desktop).toContain("LABS_NAVIGATION_DESTINATIONS");
    expect(mobile).toContain("LABS_NAVIGATION_DESTINATIONS");
    for (const item of EXPECTED_LABS_DESTINATIONS) {
      expect(desktop).toContain(item.to);
      expect(mobile).toContain(item.to);
    }
  });

  it.each([
    ["operator route", { id: "phenoHunt", to: "/operator/genetics-import", label: "Pheno Hunt" }],
    [
      "internal route",
      { id: "phenoHunt", to: "/internal/sensor-truth-audit", label: "Pheno Hunt" },
    ],
    ["admin route", { id: "phenoHunt", to: "/admin/leads", label: "Pheno Hunt" }],
    [
      "customer publishing",
      { id: "phenoHunt", to: "/customer/share", label: "Customer publishing" },
    ],
    [
      "retired import label",
      { id: "phenoHunt", to: "/pheno-hunts", label: "Genetics XLSX Import" },
    ],
  ])("rejects a manifest mutation that introduces %s", (_case, replacement) => {
    const mutant = LABS_NAVIGATION_DESTINATIONS.map((item, index) =>
      index === 0 ? replacement : item,
    );

    expect(auditLabsDestinations(mutant)).not.toEqual([]);
  });
});
