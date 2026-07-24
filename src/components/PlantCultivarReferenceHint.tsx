/**
 * PlantCultivarReferenceHint — dismissible "source-backed reference available"
 * suggestion on a plant, when its free-text strain confidently matches a
 * published cultivar.
 *
 * Doctrine: a SUGGESTION only. It never links plants.strain to a cultivar, never
 * writes, and offers a one-tap "not the same strain" dismissal (persisted
 * per-plant in localStorage — per device; upgrade to a row if cross-device
 * dismissal is wanted later).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { matchCultivarForStrain } from "@/lib/plantCultivarHint";

interface Props {
  strain: string | null | undefined;
  plantId: string;
}

function dismissKey(plantId: string, slug: string): string {
  return `verdant:cultivar-hint-dismissed:${plantId}:${slug}`;
}

function readDismissed(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    globalThis.localStorage?.setItem(key, "1");
  } catch {
    /* ignore unavailable storage */
  }
}

export default function PlantCultivarReferenceHint({ strain, plantId }: Props) {
  const match = useMemo(() => matchCultivarForStrain(strain), [strain]);
  const key = match ? dismissKey(plantId, match.slug) : "";
  const [dismissed, setDismissed] = useState(() => (match ? readDismissed(key) : true));

  if (!match || dismissed) return null;

  return (
    <div
      data-testid="plant-cultivar-hint"
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
    >
      <span className="text-muted-foreground">
        Source-backed reference available:{" "}
        <Link
          to={`/cultivars/${match.slug}`}
          data-testid="plant-cultivar-hint-link"
          className="font-medium text-primary underline underline-offset-2 hover:no-underline"
        >
          {match.name}
        </Link>
      </span>
      <button
        type="button"
        data-testid="plant-cultivar-hint-dismiss"
        onClick={() => {
          writeDismissed(key);
          setDismissed(true);
        }}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Not the same strain
      </button>
    </div>
  );
}
