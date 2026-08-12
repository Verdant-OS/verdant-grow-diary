import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/store/auth";
import { createPhenoHunt, defaultHuntName, validatePhenoHuntDraft } from "@/lib/phenoHuntService";
import { loadPhenoHuntCandidates } from "@/lib/phenoHuntCandidateLoader";
import { phenoHuntEmptyCopy, type PhenoCandidateOption } from "@/lib/phenoHuntCandidateRules";
import { logsPath } from "@/lib/routes";

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
  const [plants, setPlants] = useState<PhenoCandidateOption[]>([]);
  const [growScopeCount, setGrowScopeCount] = useState(0);
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
      const result = await loadPhenoHuntCandidates({
        growId,
        tentId: tentId ?? null,
      });
      if (cancelled) return;
      if (result.error) {
        toast.error(result.error);
      }
      if (result.grow) {
        setGrow(result.grow);
        setName(defaultHuntName(result.grow.name));
      } else {
        setGrow(null);
      }
      setPlants(result.candidates);
      setGrowScopeCount(result.growScopeCandidateCount);
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

  const emptyCopy = useMemo(
    () =>
      phenoHuntEmptyCopy({
        candidateCount: plants.length,
        filterTentId: tentId,
        growPlantCountIgnoringTent: growScopeCount,
      }),
    [plants.length, tentId, growScopeCount],
  );

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
          {tentId ? " (this tent)" : ""} as candidates for this hunt. Plants bound by grow_id or by
          a tent in this grow both qualify.
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
            <span className="text-xs text-muted-foreground" data-testid="ph-selected-count">
              {selected.size} selected · {plants.length} available
            </span>
          </div>

          {emptyCopy.isEmpty ? (
            <div
              className="rounded-lg border border-dashed p-6 text-center space-y-3"
              data-testid="ph-empty"
            >
              <h3 className="text-sm font-semibold">{emptyCopy.headline}</h3>
              <p className="text-xs text-muted-foreground">{emptyCopy.body}</p>
              <Button asChild size="sm" data-testid="ph-empty-cta">
                <Link to={`/grows/${growId}`}>{emptyCopy.ctaLabel}</Link>
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
                    data-testid="ph-plant-option"
                    data-binding={p.binding}
                  >
                    <Checkbox
                      id={`ph-${p.id}`}
                      checked={checked}
                      onCheckedChange={() => toggle(p.id)}
                      data-testid={`ph-toggle-${p.id}`}
                    />
                    <label htmlFor={`ph-${p.id}`} className="flex-1 min-w-0 cursor-pointer">
                      <span className="block text-sm font-medium truncate">{p.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {p.strain ? `${p.strain} · ` : ""}
                        {p.binding === "grow_id"
                          ? "Linked by grow"
                          : p.binding === "tent_grow"
                            ? "Linked via tent (assign grow on plant for best logs)"
                            : "Linked by grow + tent"}
                      </span>
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
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Back
    </Link>
  );
}
