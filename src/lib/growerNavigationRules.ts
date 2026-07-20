export interface GrowerNavigationDestination {
  id: "phenoHunt" | "breedingPrograms" | "lineageRepair" | "agentIntegrations" | "aiSessions";
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
] as const satisfies readonly GrowerNavigationDestination[];

export type LabsNavigationDestinationId = (typeof LABS_NAVIGATION_DESTINATIONS)[number]["id"];
