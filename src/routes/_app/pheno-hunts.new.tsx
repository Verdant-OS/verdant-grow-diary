import { createFileRoute } from "@tanstack/react-router";
import PhenoHuntNew from "@/pages/PhenoHuntNew";
import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";

export const Route = createFileRoute("/_app/pheno-hunts/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PhenoTrackerUpgradeGate>
      <PhenoHuntNew />
    </PhenoTrackerUpgradeGate>
  );
}
