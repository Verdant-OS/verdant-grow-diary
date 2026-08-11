/**
 * SoilMoistureCalibrationCaptureCard — grower dry/wet baseline capture.
 *
 * Tent-scoped manual calibration for Sensors. Display calibration remains
 * read-time only; this card is the missing write UI. No irrigation advice.
 */
import { useMemo, useState } from "react";
import { Droplets } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaveSoilMoistureCalibration } from "@/hooks/useSaveSoilMoistureCalibration";
import {
  SOIL_MOISTURE_CALIBRATION_CAPTURE_CAVEAT,
  SOIL_MOISTURE_CALIBRATION_CAPTURE_TITLE,
  SOIL_MOISTURE_RAW_UNIT_HINT,
  soilMoistureCalibrationFieldErrorCopy,
  validateSoilMoistureCalibrationCapture,
} from "@/lib/soilMoistureCalibrationCaptureRules";
import {
  selectSoilMoistureCalibration,
  type SoilMoistureCalibrationCandidate,
} from "@/lib/soilMoistureCalibrationSelectionRules";
import { cn } from "@/lib/utils";

export interface SoilMoistureCalibrationCaptureCardProps {
  growId: string | null | undefined;
  tentId: string | null | undefined;
  tentName?: string | null;
  /** Latest raw soil moisture for "use latest" helpers. */
  latestRawSoilMoisture?: number | null;
  calibrations?: readonly SoilMoistureCalibrationCandidate[] | null;
  className?: string;
}

export function SoilMoistureCalibrationCaptureCard({
  growId,
  tentId,
  tentName = null,
  latestRawSoilMoisture = null,
  calibrations = [],
  className,
}: SoilMoistureCalibrationCaptureCardProps) {
  const [dryRaw, setDryRaw] = useState("");
  const [wetRaw, setWetRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const save = useSaveSoilMoistureCalibration();

  const activeSelection = useMemo(
    () =>
      selectSoilMoistureCalibration(
        { growId, tentId, plantId: null, deviceId: null },
        calibrations,
      ),
    [growId, tentId, calibrations],
  );

  const preview = useMemo(
    () =>
      validateSoilMoistureCalibrationCapture({
        growId,
        tentId,
        plantId: null,
        deviceId: null,
        dryRaw,
        wetRaw,
        notes,
      }),
    [growId, tentId, dryRaw, wetRaw, notes],
  );

  const canSave = preview.ok && !save.isPending;
  const latestUsable =
    typeof latestRawSoilMoisture === "number" && Number.isFinite(latestRawSoilMoisture);

  const onSave = async () => {
    setSavedFlash(false);
    try {
      await save.mutateAsync({
        growId,
        tentId,
        plantId: null,
        deviceId: null,
        dryRaw,
        wetRaw,
        notes,
      });
      setSavedFlash(true);
      setNotes("");
    } catch {
      // error shown via save.error
    }
  };

  const scopeReady = Boolean(growId && tentId);

  return (
    <Card
      className={cn("min-w-0", className)}
      data-testid="soil-moisture-calibration-capture"
      data-scope-ready={scopeReady ? "true" : "false"}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Droplets className="h-4 w-4 text-primary" aria-hidden />
          {SOIL_MOISTURE_CALIBRATION_CAPTURE_TITLE}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground" data-testid="soil-moisture-calibration-unit-hint">
          {SOIL_MOISTURE_RAW_UNIT_HINT}
          {tentName ? ` · Tent: ${tentName}` : ""}
        </p>

        {activeSelection.status === "selected" ? (
          <div
            className="rounded-md border border-border/60 bg-secondary/10 p-2.5 text-xs space-y-0.5"
            data-testid="soil-moisture-calibration-active"
          >
            <p className="font-medium">Active baseline</p>
            <p className="text-muted-foreground">
              Dry {activeSelection.calibration.dryRaw} · Wet {activeSelection.calibration.wetRaw}
              {" · "}
              {activeSelection.source} · {activeSelection.matchScope}
            </p>
            <p className="text-muted-foreground">Saving replaces this active tent-level baseline.</p>
          </div>
        ) : activeSelection.status === "unavailable" ? (
          <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="soil-moisture-calibration-active-invalid">
            Active baseline is invalid (dry and wet must differ). Save a new pair to replace it.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="soil-moisture-calibration-none">
            No active tent-level baseline yet. Set dry and wet from a known-dry and known-wet probe
            reading.
          </p>
        )}

        {!scopeReady ? (
          <p className="text-sm text-muted-foreground" data-testid="soil-moisture-calibration-need-tent">
            Select a tent with a grow before saving calibration.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="soil-cal-dry">Dry raw point</Label>
                <Input
                  id="soil-cal-dry"
                  inputMode="decimal"
                  value={dryRaw}
                  onChange={(e) => setDryRaw(e.target.value)}
                  placeholder="e.g. 12"
                  data-testid="soil-moisture-calibration-dry"
                  className="min-h-11"
                />
                {preview.errors.dryRaw ? (
                  <p className="text-xs text-destructive" data-testid="soil-moisture-calibration-dry-error">
                    {soilMoistureCalibrationFieldErrorCopy("dryRaw", preview.errors.dryRaw)}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-full"
                  disabled={!latestUsable}
                  data-testid="soil-moisture-calibration-use-latest-dry"
                  onClick={() => {
                    if (latestUsable) setDryRaw(String(latestRawSoilMoisture));
                  }}
                >
                  Use latest soil as dry
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="soil-cal-wet">Wet raw point</Label>
                <Input
                  id="soil-cal-wet"
                  inputMode="decimal"
                  value={wetRaw}
                  onChange={(e) => setWetRaw(e.target.value)}
                  placeholder="e.g. 88"
                  data-testid="soil-moisture-calibration-wet"
                  className="min-h-11"
                />
                {preview.errors.wetRaw ? (
                  <p className="text-xs text-destructive" data-testid="soil-moisture-calibration-wet-error">
                    {soilMoistureCalibrationFieldErrorCopy("wetRaw", preview.errors.wetRaw)}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-full"
                  disabled={!latestUsable}
                  data-testid="soil-moisture-calibration-use-latest-wet"
                  onClick={() => {
                    if (latestUsable) setWetRaw(String(latestRawSoilMoisture));
                  }}
                >
                  Use latest soil as wet
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="soil-cal-notes">Notes (optional)</Label>
              <Input
                id="soil-cal-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Medium, probe depth, date…"
                data-testid="soil-moisture-calibration-notes"
                className="min-h-11"
              />
              {preview.errors.notes ? (
                <p className="text-xs text-destructive">
                  {soilMoistureCalibrationFieldErrorCopy("notes", preview.errors.notes)}
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              disabled={!canSave}
              data-testid="soil-moisture-calibration-save"
              onClick={() => {
                void onSave();
              }}
            >
              {save.isPending ? "Saving…" : "Save dry/wet baseline"}
            </Button>

            {save.isError ? (
              <p
                className="text-xs text-destructive"
                role="alert"
                data-testid="soil-moisture-calibration-save-error"
              >
                {save.error.message}
              </p>
            ) : null}
            {savedFlash && !save.isError ? (
              <p
                className="text-xs text-emerald-700 dark:text-emerald-400"
                data-testid="soil-moisture-calibration-save-success"
              >
                Baseline saved. Soil cards will use it for calibrated display only.
              </p>
            ) : null}
          </div>
        )}

        <p className="text-xs text-muted-foreground" data-testid="soil-moisture-calibration-caveat">
          {SOIL_MOISTURE_CALIBRATION_CAPTURE_CAVEAT}
        </p>
      </CardContent>
    </Card>
  );
}

export default SoilMoistureCalibrationCaptureCard;
