import { createFileRoute } from "@tanstack/react-router";
import PhenoKeepersPage from "@/pages/PhenoKeepersPage";
import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";

export const Route = createFileRoute("/_app/pheno-hunts_/$id/keepers")({
  component: RouteComponent,
});

function RouteComponent() {
  // allowReadOnly: a canceled/paused prior-Pro grower keeps VIEW access to
  // their own existing records (featureEntitlements: "we never hide a user's
  // own past pheno data as a billing punishment"). Writes stay double-gated:
  // canWriteFeatureData in the UI and RESTRICTIVE RLS server-side. The
  // create-a-hunt route (pheno-hunts_.new) deliberately does NOT pass this.
  return (
    <PhenoTrackerUpgradeGate allowReadOnly>
      <PhenoKeepersPage />
    </PhenoTrackerUpgradeGate>
  );
}
