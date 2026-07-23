/**
 * CultivarBlueprintCrossSell — converts high-intent cultivar-page traffic into
 * Pro Blueprint activation / Craft conversion.
 *
 * Honest framing: the Pro Blueprint scores a plant's readings against per-stage
 * SOP bands (it is cultivar-agnostic), so this cross-sells the grower's OWN
 * plant Blueprint from the moment they're reading about a strain — it does not
 * claim to compare this specific cultivar. Reuses the shipped `blueprint`
 * capability gate; no new billing infra.
 */
import { Link } from "react-router-dom";
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canUseCapability } from "@/lib/entitlements/capabilityAccess";
import { plantsPath } from "@/lib/routes";

interface Props {
  cultivar: VerdantCultivarProfile;
}

export default function CultivarBlueprintCrossSell({ cultivar }: Props) {
  const { loading, entitlement, lookupFailed } = useMyEntitlements();
  if (loading) return null;

  const unlocked = !lookupFailed && canUseCapability(entitlement, "blueprint");

  return (
    <section
      data-testid="cultivar-blueprint-crosssell"
      data-unlocked={unlocked ? "true" : "false"}
      className="mt-10 rounded-xl border border-primary/30 bg-primary/5 p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
        {unlocked ? "Pro Blueprint" : "Craft feature"}
      </p>
      <h2 className="mt-1 font-display text-xl font-semibold">
        Score your own plant against pro stage targets
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Reading up on {cultivar.name}? The Pro Blueprint grades your plant&apos;s
        live and logged readings green, amber or red against per-stage VPD,
        temperature, humidity, EC, pH and light bands — over the readings you
        already have. It scores your plant, not the reference profile.
      </p>
      {unlocked ? (
        <Link
          to={plantsPath()}
          data-testid="cultivar-blueprint-open"
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Open your plants
        </Link>
      ) : (
        <Link
          to="/pricing?plan=craft_annual"
          data-testid="cultivar-blueprint-upgrade"
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Unlock the Blueprint with Craft
        </Link>
      )}
    </section>
  );
}
