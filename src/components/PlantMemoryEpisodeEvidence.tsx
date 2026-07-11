/**
 * PlantMemoryEpisodeEvidence — renders one evidence window (before/after)
 * with honest sensor-truth labeling. Presenter only.
 *
 * SAFETY: never claims the reading proves an effect. Invalid evidence is
 * never shown as usable; stale is never shown as current; demo is always
 * labeled demo.
 */
import { sensorEvidenceChip } from "@/lib/plantMemoryEpisodeViewModel";
import type {
  EpisodeEvidenceWindow,
  EpisodePhotoEvidence,
  EpisodeSensorEvidence,
} from "@/lib/plantMemoryEpisodeRules";

export interface PlantMemoryEpisodeEvidenceProps {
  readonly windowLabel: string;
  readonly window: EpisodeEvidenceWindow;
  readonly sensorSnapshots: readonly EpisodeSensorEvidence[];
  readonly photos: readonly EpisodePhotoEvidence[];
}

export function PlantMemoryEpisodeEvidence({
  windowLabel,
  window,
  sensorSnapshots,
  photos,
}: PlantMemoryEpisodeEvidenceProps) {
  const windowSensors = sensorSnapshots.filter((s) => s.window === window);
  const windowPhotos = photos.filter((p) => p.window === window);

  if (windowSensors.length === 0 && windowPhotos.length === 0) {
    return (
      <div>
        <h4 className="text-sm font-semibold">{windowLabel}</h4>
        <p className="text-sm text-muted-foreground">No linked evidence in this window.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-semibold">{windowLabel}</h4>
      {windowSensors.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {windowSensors.map((snapshot) => (
            <li key={snapshot.snapshotId} className="flex items-center justify-between text-sm">
              <time dateTime={snapshot.capturedAt} className="text-muted-foreground">
                {formatCapturedAt(snapshot.capturedAt)}
              </time>
              <span
                className={
                  snapshot.usable ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"
                }
              >
                {sensorEvidenceChip(snapshot)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {windowPhotos.length > 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {windowPhotos.length} photo{windowPhotos.length === 1 ? "" : "s"} recorded in this
          window.
        </p>
      ) : null}
    </div>
  );
}

function formatCapturedAt(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Unknown time";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
