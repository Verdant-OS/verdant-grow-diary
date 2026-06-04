import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * CsvPreviewReviewGate — presentational-only review gate for the future
 * CSV/TSV → sensor import flow.
 *
 * Safe-by-Design:
 *  - No write handler. No Supabase call. No fetch. No diary insert.
 *  - The Save/Convert button is ALWAYS disabled in this build. The gate
 *    state shown below is informational so growers/partners can see what
 *    will be required when the approval-required write flow ships.
 */
export interface CsvPreviewReviewGateProps {
  hasHardBlockedRows: boolean;
  hasAcceptedRows: boolean;
}

const CONFIRM_COPY =
  "I confirm this is my data and understand this import is not live data.";
const FUTURE_FLOW_COPY =
  "Import requires review and will be enabled in a separate approval-required flow.";

export function CsvPreviewReviewGate({
  hasHardBlockedRows,
  hasAcceptedRows,
}: CsvPreviewReviewGateProps) {
  const [growId, setGrowId] = useState("");
  const [tentId, setTentId] = useState("");
  const [plantId, setPlantId] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const checks = useMemo(
    () => ({
      growSelected: growId.trim().length > 0,
      tentSelected: tentId.trim().length > 0,
      confirmed,
      hasAcceptedRows,
      noHardBlocks: !hasHardBlockedRows,
    }),
    [growId, tentId, confirmed, hasAcceptedRows, hasHardBlockedRows],
  );

  const gateReady =
    checks.growSelected &&
    checks.tentSelected &&
    checks.confirmed &&
    checks.hasAcceptedRows &&
    checks.noHardBlocks;

  // Even when gateReady is true, the action stays disabled in this build.
  // The write path ships in a separate approval-required PR.
  const WRITES_ENABLED = false;

  return (
    <section
      data-testid="csv-preview-review-gate"
      data-gate-ready={gateReady ? "true" : "false"}
      className="rounded-md border border-border bg-muted/20 p-4 space-y-3"
      aria-label="Future import review gate (disabled)"
    >
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">Future import review (preview only)</h3>
        <span className="text-xs text-muted-foreground">{FUTURE_FLOW_COPY}</span>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="csv-gate-grow-id" className="text-xs">
            Grow
          </Label>
          <Input
            id="csv-gate-grow-id"
            data-testid="csv-gate-grow-id"
            value={growId}
            onChange={(e) => setGrowId(e.target.value)}
            placeholder="grow id"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="csv-gate-tent-id" className="text-xs">
            Tent
          </Label>
          <Input
            id="csv-gate-tent-id"
            data-testid="csv-gate-tent-id"
            value={tentId}
            onChange={(e) => setTentId(e.target.value)}
            placeholder="tent id"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="csv-gate-plant-id" className="text-xs">
            Plant (optional)
          </Label>
          <Input
            id="csv-gate-plant-id"
            data-testid="csv-gate-plant-id"
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
            placeholder="plant id"
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs">
        <Checkbox
          id="csv-gate-confirm"
          data-testid="csv-gate-confirm"
          checked={confirmed}
          onCheckedChange={(v) => setConfirmed(v === true)}
        />
        <span>{CONFIRM_COPY}</span>
      </label>

      <ul
        data-testid="csv-gate-checklist"
        className="text-xs text-muted-foreground space-y-0.5"
      >
        <li data-testid="csv-gate-check-grow" data-ok={checks.growSelected}>
          Grow selected: {checks.growSelected ? "yes" : "no"}
        </li>
        <li data-testid="csv-gate-check-tent" data-ok={checks.tentSelected}>
          Tent selected: {checks.tentSelected ? "yes" : "no"}
        </li>
        <li data-testid="csv-gate-check-accepted" data-ok={checks.hasAcceptedRows}>
          At least one accepted row: {checks.hasAcceptedRows ? "yes" : "no"}
        </li>
        <li data-testid="csv-gate-check-no-blocks" data-ok={checks.noHardBlocks}>
          Zero hard-blocked rows: {checks.noHardBlocks ? "yes" : "no"}
        </li>
        <li data-testid="csv-gate-check-confirmed" data-ok={checks.confirmed}>
          Confirmation acknowledged: {checks.confirmed ? "yes" : "no"}
        </li>
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          aria-disabled="true"
          data-testid="csv-gate-save-button"
          data-writes-enabled={WRITES_ENABLED ? "true" : "false"}
          title="Coming later — approval-required flow"
        >
          Convert to diary entries — coming later
        </Button>
        <span className="text-xs text-muted-foreground">
          {gateReady
            ? "Gate ready. Save remains disabled until the write flow ships."
            : "Complete the checklist above. Save will remain disabled until then."}
        </span>
      </div>
    </section>
  );
}

export default CsvPreviewReviewGate;
