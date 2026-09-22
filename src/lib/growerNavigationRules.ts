import { breedingProgramsPath, phenoHuntsPath } from "@/lib/routes";

export interface GrowerNavigationDestination {
  id:
    | "phenoHunt"
    | "breedingPrograms"
    | "lineageRepair"
    | "agentIntegrations"
    | "aiSessions"
    | "genetics";
  to: string;
  label: string;
}

/**
 * Advanced authenticated tools live behind More -> Labs.
 *
 * This changes discoverability only. Route authorization and capability gates
 * remain owned by the router and the destination surfaces. Customer publishing
 * is intentionally absent until its Phase 4 authorization and share-token
 * contracts are proven.
 */
export const LABS_NAVIGATION_DESTINATIONS = [
  { id: "phenoHunt", to: "/pheno-hunts", label: "Pheno Hunt" },
  { id: "breedingPrograms", to: "/breeding", label: "Breeding Programs" },
  { id: "lineageRepair", to: "/grow-lineage", label: "Lineage Repair" },
  {
    id: "agentIntegrations",
    to: "/settings/agent-integrations",
    label: "Agent Integrations",
  },
  { id: "aiSessions", to: "/doctor/sessions", label: "AI Sessions" },
  { id: "genetics", to: "/genetics", label: "Genetics" },
] as const satisfies readonly GrowerNavigationDestination[];

export type LabsNavigationDestinationId = (typeof LABS_NAVIGATION_DESTINATIONS)[number]["id"];

/**
 * Soft-couple only: rewrite Labs Pheno Hunt and Breeding Programs onto
 * `?growId=` when the caller already has an explicit grow. The Phase-1
 * static manifest stays byte-for-byte; this helper never invents a growId.
 */
export function resolveLabsNavigationDestinations(
  growId?: string | null,
): GrowerNavigationDestination[] {
  const trimmed = typeof growId === "string" ? growId.trim() : "";
  const scopedGrowId = trimmed || null;
  return LABS_NAVIGATION_DESTINATIONS.map((item) => {
    if (item.id === "phenoHunt") return { ...item, to: phenoHuntsPath(scopedGrowId) };
    if (item.id === "breedingPrograms") {
      return { ...item, to: breedingProgramsPath(scopedGrowId) };
    }
    return { ...item };
  });
}
