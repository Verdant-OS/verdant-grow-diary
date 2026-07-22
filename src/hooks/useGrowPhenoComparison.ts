/**
 * useGrowPhenoComparison — loads a real grow's most recent pheno hunt and its
 * tagged candidate plants, then builds a PhenoComparisonInput for the shared
 * Pheno Comparison presenter.
 *
 * Read-only. RLS scopes every query to the signed-in owner. No writes, no AI,
 * no device control. Pure mapping lives in phenoComparisonRealInput.ts; this
 * hook only fetches and assembles.
 *
 * Data sources:
 *   - pheno_hunts            — the most recent hunt for the grow.
 *   - plants (pheno_hunt_id) — candidate plants + candidate_label.
 *   - grows / tents          — display names for context.
 *   - grow_events            — recent activity per candidate (kind + note).
 *   - diary_entries.photo_url — latest photo per candidate (signed via the
 *     diary-photos bucket, same flow as Timeline).
 *   - sensor_readings        — latest reading set per candidate tent, folded
 *     through the canonical snapshotFromReadings and bridged into the pheno
 *     engine's snapshot input (context only; stale/demo stay flagged).
 *
 * Structured phenotype / post-cure records are deliberately out of scope for
 * now; the comparability engine surfaces those as honest evidence gaps.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  buildRealPhenoComparisonInput,
  phenoSnapshotFromSensorSnapshot,
  type RealPhenoActivityRow,
  type RealPhenoCandidatePlant,
} from "@/lib/phenoComparisonRealInput";
import { snapshotFromReadings } from "@/lib/sensorSnapshot";
import type { PhenoSensorSnapshotInput } from "@/lib/phenoComparisonRules";
import type { PhenoComparisonInput } from "@/lib/phenoComparisonViewModel";

const ACTIVITY_PER_CANDIDATE = 5;

export interface GrowPhenoComparisonResult {
  /** Null until a hunt is found. */
  huntId: string | null;
  huntName: string | null;
  candidateCount: number;
  /** Built comparison input (candidates: [] when no hunt / no candidates). */
  input: PhenoComparisonInput;
}

const EMPTY_RESULT: GrowPhenoComparisonResult = {
  huntId: null,
  huntName: null,
  candidateCount: 0,
  input: { huntName: null, isDemo: false, candidates: [] },
};

export function useGrowPhenoComparison(growId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery<GrowPhenoComparisonResult>({
    queryKey: ["grow_pheno_comparison", growId ?? null, user?.id ?? null],
    enabled: !!growId && !!user,
    queryFn: async (): Promise<GrowPhenoComparisonResult> => {
      if (!growId || !user) return EMPTY_RESULT;

      // Most recent hunt for this grow. RLS enforces ownership.
      const { data: huntRows, error: huntErr } = await supabase
        .from("pheno_hunts")
        .select("id,name,grow_id")
        .eq("grow_id", growId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (huntErr) throw huntErr;
      const hunt = huntRows?.[0];
      if (!hunt) return EMPTY_RESULT;

      // Candidate plants tagged into this hunt.
      const { data: plantRows, error: plantErr } = await supabase
        .from("plants")
        .select("id,candidate_label,name,strain,stage,grow_id,tent_id")
        .eq("pheno_hunt_id", hunt.id)
        .eq("is_archived", false);
      if (plantErr) throw plantErr;
      const candidates = (plantRows ?? []) as RealPhenoCandidatePlant[];
      if (candidates.length === 0) {
        return {
          huntId: hunt.id,
          huntName: (hunt as { name: string | null }).name ?? null,
          candidateCount: 0,
          input: {
            huntName: (hunt as { name: string | null }).name ?? null,
            isDemo: false,
            candidates: [],
          },
        };
      }

      const plantIds = candidates.map((c) => c.id);
      const tentIds = Array.from(
        new Set(candidates.map((c) => c.tent_id).filter((t): t is string => !!t)),
      );

      // Grow name + tent names + recent activity + latest photos, in parallel.
      const [growRes, tentRes, eventRes, photoRes] = await Promise.all([
        supabase.from("grows").select("id,name").eq("id", growId).maybeSingle(),
        tentIds.length > 0
          ? supabase.from("tents").select("id,name").in("id", tentIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("grow_events")
          .select("id,plant_id,event_type,occurred_at,note,is_deleted")
          .in("plant_id", plantIds)
          .eq("is_deleted", false)
          .order("occurred_at", { ascending: false })
          .limit(plantIds.length * ACTIVITY_PER_CANDIDATE * 2),
        supabase
          .from("diary_entries")
          .select("plant_id,photo_url,entry_at")
          .in("plant_id", plantIds)
          .not("photo_url", "is", null)
          .order("entry_at", { ascending: false })
          .limit(plantIds.length * 3),
      ]);
      if (growRes.error) throw growRes.error;
      if (tentRes.error) throw tentRes.error;
      if (eventRes.error) throw eventRes.error;
      // Photo enrichment is best-effort: a failed photo query must never
      // break the comparison itself.
      const photoRows = photoRes.error
        ? []
        : ((photoRes.data ?? []) as Array<{
            plant_id: string | null;
            photo_url: string | null;
            entry_at: string | null;
          }>);

      // Latest photo per candidate. Storage paths (non-http) are signed via
      // the diary-photos bucket — same flow the Timeline uses.
      const latestPhotoPathByPlant: Record<string, string> = {};
      for (const row of photoRows) {
        if (!row.plant_id || !row.photo_url) continue;
        if (latestPhotoPathByPlant[row.plant_id]) continue; // rows are newest-first
        latestPhotoPathByPlant[row.plant_id] = row.photo_url;
      }
      const photoUrlByPlant: Record<string, string | null> = {};
      const toSign: Array<{ plantId: string; path: string }> = [];
      for (const [plantId, url] of Object.entries(latestPhotoPathByPlant)) {
        if (url.startsWith("http")) photoUrlByPlant[plantId] = url;
        else toSign.push({ plantId, path: url });
      }
      if (toSign.length > 0) {
        const { data: signed } = await supabase.storage
          .from("diary-photos")
          .createSignedUrls(toSign.map((t) => t.path), 3600);
        const byPath = new Map(
          (signed ?? []).map((s) => [s.path as string, s.signedUrl] as const),
        );
        for (const t of toSign) {
          const url = byPath.get(t.path);
          if (url) photoUrlByPlant[t.plantId] = url;
        }
      }

      // Latest sensor snapshot per candidate tent (context only). Per-tent
      // queries so one tent's rows can't starve another's under the limit;
      // errors degrade to "no snapshot" rather than failing the comparison.
      const snapshotByTent: Record<string, PhenoSensorSnapshotInput | null> = {};
      await Promise.all(
        tentIds.map(async (tentId) => {
          const { data: readings, error: readErr } = await supabase
            .from("sensor_readings")
            .select("ts,metric,value,source,created_at,device_id")
            .eq("tent_id", tentId)
            .order("ts", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(20);
          if (readErr || !readings || readings.length === 0) {
            snapshotByTent[tentId] = null;
            return;
          }
          const folded = snapshotFromReadings(
            readings.map((r) => ({
              ts: r.ts as string,
              metric: r.metric as string,
              value: r.value as number | string | null,
              source: (r as { source?: string | null }).source ?? null,
              device_id: (r as { device_id?: string | null }).device_id ?? null,
            })),
          );
          snapshotByTent[tentId] = phenoSnapshotFromSensorSnapshot(folded);
        }),
      );

      const tentNameById: Record<string, string> = {};
      for (const t of (tentRes.data ?? []) as Array<{ id: string; name: string | null }>) {
        if (t.name) tentNameById[t.id] = t.name;
      }

      // Bucket recent activity per candidate (already newest-first from the query).
      const activityByPlant: Record<string, RealPhenoActivityRow[]> = {};
      for (const id of plantIds) activityByPlant[id] = [];
      for (const e of (eventRes.data ?? []) as Array<{
        id: string;
        plant_id: string | null;
        event_type: string | null;
        occurred_at: string | null;
        note: string | null;
      }>) {
        if (!e.plant_id || !activityByPlant[e.plant_id]) continue;
        const bucket = activityByPlant[e.plant_id];
        if (bucket.length >= ACTIVITY_PER_CANDIDATE) continue;
        bucket.push({
          id: e.id,
          at: e.occurred_at,
          kind: e.event_type,
          note: e.note,
        });
      }

      const huntName = (hunt as { name: string | null }).name ?? null;
      const input = buildRealPhenoComparisonInput({
        huntName,
        growName: (growRes.data as { name: string | null } | null)?.name ?? null,
        tentNameById,
        candidates,
        activityByPlant,
        photoUrlByPlant,
        snapshotByTent,
        maxActivityPerCandidate: ACTIVITY_PER_CANDIDATE,
      });

      return {
        huntId: hunt.id,
        huntName,
        candidateCount: candidates.length,
        input,
      };
    },
  });
}
