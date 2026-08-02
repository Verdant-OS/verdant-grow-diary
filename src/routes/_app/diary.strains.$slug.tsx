import { createFileRoute } from "@tanstack/react-router";
import CultivarDiaryProfile from "@/pages/CultivarDiaryProfile";
import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";

export const Route = createFileRoute("/diary/strains/$slug")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PhenoTrackerUpgradeGate>
                          <CultivarDiaryProfile />
                        </PhenoTrackerUpgradeGate>;
}
