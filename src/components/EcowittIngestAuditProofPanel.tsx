/**
 * EcowittIngestAuditProofPanel — read-only presenter for the EcoWitt
 * Ingest Audit Proof surface.
 *
 * Hard constraints:
 *  - Presenter only. No writes, no AI calls, no alerts, no Action Queue,
 *    no automation, no device control.
 *  - Consumes rows + status via props; never selects from Supabase.
 *  - Never renders user_id, bridge_token_id, raw payloads, or secrets.
 */
import {
  buildEcowittIngestAuditProof,
  type EcowittIngestAuditProofRow,
  type EcowittIngestAuditProofStatus,
  type EcowittIngestAuditProofViewModel,
} from "@/lib/ecowittIngestAuditProofRules";

export interface EcowittIngestAuditProofPanelProps {
  tentId: string | null | undefined;
  status: EcowittIngestAuditProofStatus;
  rows: readonly EcowittIngestAuditProofRow[] | null | undefined;
  /** Injectable now for deterministic tests. */
  now?: Date;
}

function toneClass(tone: EcowittIngestAuditProofViewModel["tone"]): string {
  switch (tone) {
    case "ok":
      return "border-emerald-500/40 bg-emerald-500/5";
    case "warn":
      return "border-amber-500/40 bg-amber-500/5";
    case "neutral":
    default:
      return "border-border bg-muted/30";
  }
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return iso;
  }
}

export function EcowittIngestAuditProofPanel(
  props: EcowittIngestAuditProofPanelProps,
): JSX.Element {
  const vm = buildEcowittIngestAuditProof(props.rows, {
    status: props.status,
    tentId: props.tentId,
    now: props.now,
  });

  return (
    <section
      data-testid="ecowitt-ingest-audit-proof-panel"
      data-status={vm.status}
      data-tone={vm.tone}
      className={`rounded-md border p-4 ${toneClass(vm.tone)}`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{vm.headline}</h3>
        <span
          className="text-xs text-muted-foreground"
          data-testid="ecowitt-ingest-audit-proof-window-label"
        >
          Proof window: {vm.windowLabel}
        </span>
      </header>

      <p
        className="mt-2 text-xs text-muted-foreground"
        data-testid="ecowitt-ingest-audit-proof-detail"
      >
        {vm.detail}
      </p>

      {vm.status === "loaded" ? (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Received</dt>
              <dd
                className="font-mono text-base"
                data-testid="ecowitt-ingest-audit-proof-received"
              >
                {vm.receivedCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Inserted</dt>
              <dd
                className="font-mono text-base"
                data-testid="ecowitt-ingest-audit-proof-inserted"
              >
                {vm.insertedCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rejected / omitted</dt>
              <dd
                className="font-mono text-base"
                data-testid="ecowitt-ingest-audit-proof-rejected"
              >
                {vm.rejectedCount}
              </dd>
            </div>
          </dl>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
            <div>
              <dt>Last accepted</dt>
              <dd
                className="font-mono"
                data-testid="ecowitt-ingest-audit-proof-last-accepted"
              >
                {formatTimestamp(vm.lastAcceptedAt)}
              </dd>
            </div>
            <div>
              <dt>Last rejected / omitted</dt>
              <dd
                className="font-mono"
                data-testid="ecowitt-ingest-audit-proof-last-rejected"
              >
                {formatTimestamp(vm.lastRejectedAt)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">
            This proof reflects ingest audit rows visible to the current user.
          </p>
        </>
      ) : null}
    </section>
  );
}

export default EcowittIngestAuditProofPanel;
