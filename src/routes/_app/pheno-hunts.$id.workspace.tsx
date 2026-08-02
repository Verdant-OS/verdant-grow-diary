import { createFileRoute } from "@tanstack/react-router";
import PhenoHuntWorkspace from "@/pages/PhenoHuntWorkspace";
import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";

export const Route = createFileRoute("/pheno-hunts/$id/workspace")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoTrackerUpgradeGate>
                          <PhenoHuntWorkspace />
                        </PhenoTrackerUpgradeGate>;
}
