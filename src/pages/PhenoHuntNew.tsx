import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sprout } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/store/auth";
import {
  createPhenoHunt,
  defaultHuntName,
  validatePhenoHuntDraft,
} from "@/lib/phenoHuntService";
import { logsPath } from "@/lib/routes";

interface PlantOption {
  id: string;
  name: string;
  strain: string | null;
}

interface GrowInfo {
  id: string;
  name: string;
}

export default function PhenoHuntNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const growId = params.get("growId");
  const tentId = params.get("tentId");

  const [grow, setGrow] = useState<GrowInfo | null>(null);
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!growId) {
        setLoading(false);
        return;
      }
      const [{ data: growRow }, { data: plantRows }] = await Promise.all([
        supabase.from("grows").select("id,name").eq("id", growId).maybeSingle(),
        (() => {
          let q = supabase
            .from("plants")
            .select("id,name,strain,tent_id")
            .eq("grow_id", growId)
            .eq("is_archived", false);
          if (tentId) q = q.eq("tent_id", tentId);
          return q;
        })(),
      ]);
      if (cancelled) return;
      if (growRow) {
        setGrow({ id: growRow.id, name: growRow.name });
        setName(defaultHuntName(growRow.name));
      }
      setPlants(
        (plantRows ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          strain: p.strain ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [growId, tentId]);

  const plantIds = useMemo(() => Array.from(selected), [selected]);
  const errors = useMemo(
    () => validatePhenoHuntDraft({ name, plantIds }, growId),
    [name, plantIds, growId],
  );
  const canSave = errors.length === 0 && !saving && !!user;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSave = async () => {
    if (!canSave || !growId) return;
    setSaving(true);
    try {
      await createPhenoHunt({
        growId,
        tentId: tentId ?? null,
        name: name.trim(),
        plantIds,
      });
      toast.success("Pheno hunt created");
      navigate(logsPath(growId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create pheno hunt");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!growId || !grow) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <BackLink to="/grows" />
        <div className="glass rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">Grow not found</h1>
          <p className="text-sm text-muted-foreground">
            Start a pheno hunt from a grow or tent detail page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <BackLink to={`/grows/${growId}`} />

      <header className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sprout className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-display font-bold">Start Pheno Hunt</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tag plants in <span className="font-medium">{grow.name}</span>
          {tentId ? " (this tent)" : ""} as candidates for this hunt.
        </p>
      </header>

      <section className="glass rounded-2xl p-4 space-y-3">
        <div className="space-y-2">
          <Label htmlFor="ph-name">Hunt name</Label>
          <Input
            id="ph-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer Pheno Hunt"
            data-testid="ph-name-input"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Candidate plants</Label>
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
            </span>
          </div>

          {plants.length === 0 ? (
            <div
              className="rounded-lg border border-dashed p-6 text-center space-y-3"
              data-testid="ph-empty"
            >
              <h3 className="text-sm font-semibold">
                No plants in this grow yet
              </h3>
              <p className="text-xs text-muted-foreground">
                Add a plant before starting a Pheno Hunt. Candidates are
                tagged plants, not separate records.
              </p>
              <Button asChild size="sm" data-testid="ph-empty-cta">
                <Link to={`/grows/${growId}`}>Go to grow to add a plant</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-1.5" data-testid="ph-plant-list">
              {plants.map((p) => {
                const checked = selected.has(p.id);
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-md border p-2"
                  >
                    <Checkbox
                      id={`ph-${p.id}`}
                      checked={checked}
                      onCheckedChange={() => toggle(p.id)}
                      data-testid={`ph-toggle-${p.id}`}
                    />
                    <label htmlFor={`ph-${p.id}`} className="flex-1 min-w-0 cursor-pointer">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.strain ?? "Unknown strain"}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" asChild>
            <Link to={`/grows/${growId}`}>Cancel</Link>
          </Button>
          <Button onClick={onSave} disabled={!canSave} data-testid="ph-save-btn">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Create Pheno Hunt"
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </Link>
  );
}
