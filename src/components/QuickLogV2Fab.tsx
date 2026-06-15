import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import QuickLogV2Sheet from "./QuickLogV2Sheet";

interface Props {
  defaultTargetKey?: string | null;
  label?: string;
}

export default function QuickLogV2Fab({ defaultTargetKey, label = "Quick Log" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Hidden on mobile — the universal mobile Quick Log entry point lives
          in AppShell as a single floating + button. Keeping this on desktop
          only prevents duplicate Quick Log CTAs at the bottom of the screen
          (which previously routed manual sensor saves through a path that
          could leak demo tent ids like "t1" into Postgres). */}
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 shadow-lg pb-[env(safe-area-inset-bottom)] md:pb-0"
        size="lg"
        aria-label={label}
      >
        <PlusCircle className="mr-2 h-5 w-5" />
        {label}
      </Button>
      <QuickLogV2Sheet
        open={open}
        onOpenChange={setOpen}
        defaultTargetKey={defaultTargetKey ?? null}
      />
    </>
  );
}
