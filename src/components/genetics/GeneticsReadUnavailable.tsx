import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GeneticsReadUnavailableProps {
  message: string;
  onRetry: () => void;
  testId: string;
}

export function GeneticsReadUnavailable({
  message,
  onRetry,
  testId,
}: GeneticsReadUnavailableProps) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-center text-sm text-amber-200"
    >
      <p className="inline-flex items-center justify-center gap-2 break-words">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {message}
      </p>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
