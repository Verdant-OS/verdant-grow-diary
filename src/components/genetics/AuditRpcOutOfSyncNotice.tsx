import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

export const BREEDING_AUDIT_RPC_OUT_OF_SYNC_MESSAGE =
  "This save could not be recorded: the audit function is missing or out of sync with the app's generated types.";

export interface AuditRpcOutOfSyncNoticeProps {
  /** Render only when true — the caller owns detection. */
  visible: boolean;
  /** RPC name, shown so an operator knows exactly what to look for. */
  rpcName?: string;
}

/**
 * Calm fallback shown when an audit RPC is absent from the API schema — either
 * the migration has not been applied or generated types / the PostgREST schema
 * cache are stale.
 *
 * Presenter only: states what happened, states that nothing was saved, and
 * points to the operator schema audit. It performs no writes, runs no
 * migration, and never claims the save succeeded.
 */
export default function AuditRpcOutOfSyncNotice({
  visible,
  rpcName = "breeding_log_save_event",
}: AuditRpcOutOfSyncNoticeProps) {
  if (!visible) return null;

  return (
    <div
      role="alert"
      data-testid="audit-rpc-out-of-sync-notice"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Audit function unavailable — nothing was saved
      </p>
      <p className="mt-1 text-muted-foreground">
        Verdant could not reach <code className="font-mono text-xs">{rpcName}</code>. The database
        migration may not be applied, or the app's generated Supabase types may be out of date. Your
        entry was not recorded, so nothing is half-written.
      </p>
      <p className="mt-2 text-muted-foreground">
        Operator next step: confirm the migration is applied, then regenerate types (
        <code className="font-mono text-xs">bun run sb:types</code>) and redeploy.
      </p>
      <Link
        to="/operator/schema-audit"
        className="mt-2 inline-block text-xs font-medium underline underline-offset-2"
      >
        Open schema audit
      </Link>
    </div>
  );
}
