import { Archive } from "lucide-react";
import { cn } from "@/lib/utils";

export function ArchivedPlantsToggle({
  pressed,
  onPressedChange,
  testId = "tent-detail-show-archived-toggle",
}: {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onPressedChange(!pressed)}
      data-testid={testId}
      aria-pressed={pressed}
      className={cn(
        "text-xs px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1",
        pressed
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-secondary/50 border-border/50 hover:bg-secondary",
      )}
    >
      <Archive className="h-3 w-3" />
      {pressed ? "Hide archived plants" : "Show archived plants"}
    </button>
  );
}
