import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Activity, Copy, KeyRound, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import {
  BRIDGE_TOKEN_DEFAULT_TTL_DAYS,
  BRIDGE_TOKEN_MAX_TTL_DAYS,
  BRIDGE_TOKEN_MIN_TTL_DAYS,
  type BridgeTokenRow,
  bridgeTokenStatus,
  clampTtlDays,
  formatIngestCount,
  sanitizeTokenName,
} from "@/lib/bridgeTokenRules";

/**
 * Tent-scoped presenter for issuing bridge tokens to headless ESP32 / Pi /
 * Node-RED devices. Plaintext is shown ONCE at mint time and never stored
 * client-side beyond the in-memory reveal. Hashed at rest server-side.
 */
export default function TentBridgeTokensCard({ tentId }: { tentId: string }) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<BridgeTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("bridge");
  const [ttlDays, setTtlDays] = useState<number>(BRIDGE_TOKEN_DEFAULT_TTL_DAYS);
  const [reveal, setReveal] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bridge_tokens")
      .select("id, name, token_prefix, expires_at, last_used_at, first_used_at, ingest_count, revoked_at, created_at")
      .eq("tent_id", tentId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load bridge tokens", description: error.message, variant: "destructive" });
    } else {
      setTokens((data ?? []) as BridgeTokenRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tentId]);

  async function mint() {
    setBusy(true);
    setReveal(null);
    const { data, error } = await supabase.functions.invoke("mint-bridge-token", {
      body: { tent_id: tentId, name: sanitizeTokenName(name), ttl_days: clampTtlDays(ttlDays) },
    });
    setBusy(false);
    if (error || !data?.ok) {
      toast({
        title: "Mint failed",
        description: (error?.message ?? data?.error ?? "Unknown error"),
        variant: "destructive",
      });
      return;
    }
    setReveal(data.token as string);
    await load();
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this token? Any device using it will stop ingesting.")) return;
    const { error, data } = await supabase.functions.invoke("revoke-bridge-token", { body: { id } });
    if (error || !data?.ok) {
      toast({ title: "Revoke failed", description: error?.message ?? "Unknown error", variant: "destructive" });
      return;
    }
    await load();
  }

  async function copyReveal() {
    if (!reveal) return;
    await navigator.clipboard.writeText(reveal);
    toast({ title: "Token copied", description: "Paste it into your device config now — it won't be shown again." });
  }

  return (
    <div className="glass rounded-2xl p-4 mt-4" data-testid="tent-bridge-tokens-card">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="size-4 text-muted-foreground" />
        <h2 className="font-display font-semibold">Bridge tokens</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Mint a tent-scoped, expiring API token for headless ESP32 / Pi / Node-RED bridges.
        Tokens are read-only sensor ingest only — never device control. Shown once at mint time.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <Input
          aria-label="Token name"
          placeholder="e.g. esp32-shelf-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="sm:max-w-xs"
        />
        <Input
          aria-label="Expires in days"
          type="number"
          min={BRIDGE_TOKEN_MIN_TTL_DAYS}
          max={BRIDGE_TOKEN_MAX_TTL_DAYS}
          value={ttlDays}
          onChange={(e) => setTtlDays(Number(e.target.value))}
          className="sm:max-w-[120px]"
        />
        <Button onClick={mint} disabled={busy} data-testid="mint-bridge-token-btn">
          {busy ? "Minting…" : "Mint token"}
        </Button>
      </div>

      {reveal && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 mb-3" role="alert">
          <div className="text-xs font-medium mb-1">Your new token (shown once)</div>
          <div className="flex items-center gap-2">
            <code className="text-xs break-all flex-1 select-all">{reveal}</code>
            <Button size="sm" variant="outline" onClick={copyReveal}>
              <Copy className="size-3 mr-1" /> Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReveal(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : tokens.length === 0 ? (
        <div className="text-sm text-muted-foreground">No bridge tokens yet.</div>
      ) : (
        <ul className="divide-y divide-border/50">
          {tokens.map((t) => {
            const status = bridgeTokenStatus(t);
            return (
              <li key={t.id} className="flex items-center justify-between py-2 gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {t.token_prefix}… · expires {new Date(t.expires_at).toLocaleDateString()}
                    {t.last_used_at ? ` · used ${new Date(t.last_used_at).toLocaleDateString()}` : " · unused"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>
                  {status === "active" && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(t.id)} aria-label="Revoke token">
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
