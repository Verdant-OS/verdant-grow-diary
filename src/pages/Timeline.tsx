import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGrows } from "@/store/grows";
import { useAuth } from "@/store/auth";
import { stageLabel } from "@/lib/grow";
import { format, formatDistanceToNow } from "date-fns";
import { Sprout, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface Entry {
  id: string; note: string; photo_url: string | null; stage: string | null;
  details: Record<string, any>; entry_at: string;
}

export default function Timeline() {
  const { user } = useAuth();
  const { activeGrow, activeGrowId, grows, loading: growsLoading } = useGrows();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user || !activeGrowId) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("diary_entries")
      .select("id,note,photo_url,stage,details,entry_at")
      .eq("grow_id", activeGrowId).order("entry_at", { ascending: false }).limit(100);
    setEntries((data as Entry[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [activeGrowId, user]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("verdant:entry-created", h);
    return () => window.removeEventListener("verdant:entry-created", h);
  });

  if (growsLoading) return <Center><Loader2 className="h-5 w-5 animate-spin" /></Center>;

  if (grows.length === 0) {
    return (
      <Empty title="Start your first grow" desc="Create a grow to begin tracking your plants." cta={<Button asChild className="gradient-leaf text-primary-foreground"><Link to="/grows">Create grow</Link></Button>} />
    );
  }

  return (
    <div>
      {activeGrow && (
        <div className="mb-5">
          <h1 className="text-2xl font-display font-bold">{activeGrow.name}</h1>
          <p className="text-sm text-muted-foreground">{stageLabel(activeGrow.stage)} · day {Math.max(1, Math.floor((Date.now() - new Date(activeGrow.started_at).getTime()) / 86400000))}</p>
        </div>
      )}

      {loading ? <Center><Loader2 className="h-5 w-5 animate-spin" /></Center>
        : entries.length === 0 ? (
          <Empty title="No entries yet" desc="Tap the + button to log your first photo and note." />
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="glass rounded-2xl overflow-hidden animate-fade-in">
                {e.photo_url ? (
                  <img src={e.photo_url} className="w-full aspect-[4/3] object-cover" alt="" loading="lazy" />
                ) : (
                  <div className="w-full aspect-[4/3] bg-secondary/40 flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-primary"><Sprout className="h-3 w-3" />{stageLabel(e.stage)}</span>
                    <span>·</span>
                    <span title={format(new Date(e.entry_at), "PPpp")}>{formatDistanceToNow(new Date(e.entry_at), { addSuffix: true })}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{e.note}</p>
                  {e.details && Object.keys(e.details).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(e.details).map(([k, v]) => (
                        <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/60 border border-border/40 capitalize">
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

function Center({ children }: any) { return <div className="py-20 flex justify-center text-muted-foreground">{children}</div>; }
function Empty({ title, desc, cta }: { title: string; desc: string; cta?: React.ReactNode }) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto h-16 w-16 rounded-2xl glass flex items-center justify-center mb-4"><Sprout className="h-7 w-7 text-primary" /></div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-xs mx-auto">{desc}</p>
      {cta}
    </div>
  );
}
