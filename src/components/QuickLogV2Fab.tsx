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
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 shadow-lg"
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
