import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DailyGrowCheckReadState } from "@/hooks/useDailyGrowCheckReads";

export function DailyGrowCheckReadNotice({
  kind,
  plantId,
  state,
  isFetching,
  retry,
}: {
  kind: "consistency" | "history";
  plantId: string;
  state: Exclude<DailyGrowCheckReadState, "ready">;
  isFetching: boolean;
  retry: () => Promise<unknown>;
}) {
  return (
    <Card
      data-testid={`plant-daily-grow-check-${kind}`}
      data-plant-id={plantId}
      className="p-4 space-y-3"
    >
      <p className="text-sm text-muted-foreground">
        {kind === "consistency" ? "Check Consistency" : "Daily Grow Check History"}
      </p>
      {state === "error" ? (
        <div role="alert" className="space-y-2">
          <p>Daily Grow Check is unavailable. We couldn't verify the saved history.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void retry()}
            aria-label="Retry Daily Grow Check"
          >
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {state === "paused"
            ? "Waiting for connection to load Daily Grow Check…"
            : "Loading Daily Grow Check…"}
        </p>
      )}
    </Card>
  );
}
