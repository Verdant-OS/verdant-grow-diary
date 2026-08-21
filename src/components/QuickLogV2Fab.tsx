import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { useLocation } from "@/lib/react-router-compat";
import {
  didQuickLogDetailRouteChange,
  resolveQuickLogDetailRouteIdentity,
} from "@/lib/quickLogRouteTargetRules";
import QuickLogV2Sheet from "./QuickLogV2Sheet";

interface Props {
  defaultTargetKey?: string | null;
  label?: string;
}

export default function QuickLogV2Fab({ defaultTargetKey, label = "Quick Log" }: Props) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // The default target is a LAUNCH PARAMETER, not a live binding.
  //
  // Pages derive it from queries that settle independently — a sole-plant tent
  // can only prove its plant target once `useGrowPlants` returns — so the prop
  // can change while the sheet is already open. `QuickLogV2Sheet`
  // re-initialises its ENTIRE draft when `defaultTargetKey` changes (note,
  // action, media, feeding/watering/maturity forms), so a late arrival would
  // silently discard whatever the grower had typed or attached.
  //
  // Freeze the value the grower actually opened with. The scope they saw when
  // they tapped is the scope they keep for that session; a target that becomes
  // provable afterwards is simply used on the next open. Never lose input to
  // make a target more specific.
  const [launchTargetKey, setLaunchTargetKey] = useState<string | null>(null);
  const routeIdentity = resolveQuickLogDetailRouteIdentity(pathname);
  const previousRouteIdentityRef = useRef(routeIdentity);

  useEffect(() => {
    const previousRouteIdentity = previousRouteIdentityRef.current;
    previousRouteIdentityRef.current = routeIdentity;

    // A route-id change is categorically different from a query refining the
    // same detail page. The frozen target belongs to the prior plant/tent, so
    // close the sheet and clear it before it can be reused on the new detail.
    if (!didQuickLogDetailRouteChange(previousRouteIdentity, routeIdentity)) return;
    setOpen(false);
    setLaunchTargetKey(null);
  }, [routeIdentity]);

  return (
    <>
      {/* Hidden on mobile — the universal mobile Quick Log entry point lives
          in AppShell as a single floating + button. Keeping this on desktop
          only prevents duplicate Quick Log CTAs at the bottom of the screen
          (which previously routed manual sensor saves through a path that
          could leak demo tent ids like "t1" into Postgres). */}
      <Button
        type="button"
        onClick={() => {
          setLaunchTargetKey(defaultTargetKey ?? null);
          setOpen(true);
        }}
        className="hidden md:inline-flex fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 shadow-lg pb-[env(safe-area-inset-bottom)] md:pb-0"
        size="lg"
        aria-label={label}
      >
        <PlusCircle className="mr-2 h-5 w-5" />
        {label}
      </Button>
      <QuickLogV2Sheet open={open} onOpenChange={setOpen} defaultTargetKey={launchTargetKey} />
    </>
  );
}
