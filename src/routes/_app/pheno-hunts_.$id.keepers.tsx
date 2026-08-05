import { createFileRoute } from "@tanstack/react-router";
import PhenoKeepersPage from "@/pages/PhenoKeepersPage";
import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";

export const Route = createFileRoute("/_app/pheno-hunts_/$id/keepers")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PhenoTrackerUpgradeGate>
      <PhenoKeepersPage />
    </PhenoTrackerUpgradeGate>
  );
}
