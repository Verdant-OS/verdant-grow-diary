/**
 * /pheno-hunts/new — operator-only Pheno Hunt Start Page (v1).
 *
 * Mounted inside AppShell so it inherits the authenticated/operator gate.
 * Loads the operator's plants (RLS-scoped) read-only for candidate linking.
 * Persistence is handled by useCreatePhenoHunt inside the presenter.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PhenoHuntStartPage from "@/components/PhenoHuntStartPage";
import type { CandidatePlant } from "@/lib/phenoHuntStartPageRules";

export default function PhenoHuntNew() {
  const [params] = useSearchParams();
  const growId = params.get("growId");
  const tentId = params.get("tentId");

  const [plants, setPlants] = useState<CandidatePlant[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!cancelled) setUserId(auth.user?.id ?? null);

      const { data } = await supabase
        .from("plants")
        .select("id,name,strain,stage,grow_id,tent_id,is_archived");
      if (cancelled || !data) return;
      setPlants(
        data.map((p) => ({
          id: p.id,
          name: p.name,
          strain: p.strain,
          stage: p.stage,
          growId: p.grow_id,
          tentId: p.tent_id,
          isArchived: p.is_archived,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PhenoHuntStartPage
      allPlants={plants}
      userId={userId}
      initialDraft={{ growId: growId ?? null, tentId: tentId ?? null }}
    />
  );
}
