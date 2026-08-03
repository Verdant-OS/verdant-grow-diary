import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Graceful fallback UI shown when an audit RPC is detected as missing or
 * out of sync with the generated Supabase schema types.
 *
 * Grower-safe: names the affected surface, explains that nothing was written,
 * points the operator at the remediation ("refresh schema types + redeploy"),
 * and offers a retry once they've reconciled. No raw backend error text is
 * echoed here — the underlying error is preserved on
 * `MissingAuditRpcError.cause` for logs, not for the UI.
 */
export interface AuditRpcMissingFallbackProps {
  /** Name of the RPC that failed, e.g. "breeding_log_save_event". */
  rpcName: string;
  /**
   * Human-readable label of the audit surface the RPC powers, e.g.
   * "breeding event". Used in the title so the operator immediately knows
   * which flow is degraded.
   */
  surfaceLabel: string;
  /** Retry the last attempted call. Optional — omit when retry isn't safe. */
  onRetry?: () => void;
  /** Optional dismiss / return-to-form control. */
  onDismiss?: () => void;
}

export function AuditRpcMissingFallback({
  rpcName,
  surfaceLabel,
  onRetry,
  onDismiss,
}: AuditRpcMissingFallbackProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="audit-rpc-missing-fallback"
      data-rpc-name={rpcName}
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {surfaceLabel} audit is temporarily unavailable
          </h3>
          <p className="text-xs text-muted-foreground">
            The audit function powering this action isn't reachable from the deployed schema right
            now, so nothing was written. Your plants, grows, and prior entries are unchanged.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-amber-500/20 bg-background/60 p-3 space-y-1">
        <p className="text-xs font-medium text-foreground">Operator next steps</p>
        <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-0.5">
          <li>
            Confirm the migration that defines{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{rpcName}</code> has been
            applied to production.
          </li>
          <li>
            Refresh the generated schema types so the client and backend agree (
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
              bun run sync-supabase-types
            </code>{" "}
            or equivalent).
          </li>
          <li>Redeploy any edge functions that depend on this RPC.</li>
        </ol>
      </div>

      {(onRetry || onDismiss) && (
        <div className="flex flex-wrap gap-2">
          {onRetry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              data-testid="audit-rpc-missing-fallback-retry"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              data-testid="audit-rpc-missing-fallback-dismiss"
            >
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
