import { createFileRoute } from "@tanstack/react-router";
import PhenoHuntsIndex from "@/pages/PhenoHuntsIndex";
import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";

export const Route = createFileRoute("/_app/pheno-hunts")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoTrackerUpgradeGate>
                          <PhenoHuntsIndex />
                        </PhenoTrackerUpgradeGate>;
}
