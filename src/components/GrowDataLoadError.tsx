import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface GrowDataLoadErrorProps {
  resource: string;
  onRetry?: () => void;
  testId: string;
  message?: string;
}

/**
 * Shared failed-read state for private grow reads.
 *
 * The copy intentionally distinguishes a failed read from a confirmed empty
 * result so setup prompts and zero counts never replace existing grow data.
 */
export default function GrowDataLoadError({
  resource,
  onRetry,
  testId,
  message = "We couldn't load this grow data. This is not an empty grow. Try the read again.",
}: GrowDataLoadErrorProps) {
  return (
    <div className="glass rounded-2xl p-6 text-center" role="alert" data-testid={testId}>
      <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-destructive" aria-hidden="true" />
      <p className="font-semibold">{resource} unavailable</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 gap-1.5"
          onClick={onRetry}
          data-testid={`${testId}-retry`}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

interface GrowDataLoadingStateProps {
  resource: string;
  testId: string;
}

/** Loading presenter that never implies a confirmed empty result. */
export function GrowDataLoadingState({ resource, testId }: GrowDataLoadingStateProps) {
  return (
    <div
      className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
      data-testid={testId}
    >
      <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" aria-hidden="true" />
      Loading {resource.toLowerCase()}…
    </div>
  );
}
