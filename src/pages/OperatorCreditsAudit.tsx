/**
 * OperatorCreditsAudit — operator-only, read-only audit surface for
 * troubleshooting AI credit grants, spends, refunds, and referral
 * conversions.
 *
 * SAFETY:
 *  - Route is nested under <RequireOperatorRole /> (UI gate).
 *  - Data comes from the operator-credits-audit edge function, which
 *    re-verifies operator role server-side before running any query
 *    (real security boundary). This page is a pure presenter.
 *  - Shows ONLY row IDs, timestamps, enums, and integer counts. No
 *    email, name, or profile fields. UUID owner IDs are shown so
 *    operators can cross-reference rows across tables — they are
 *    account identifiers, not PII in the sense the user asked to avoid
 *    (name/email/contact).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Copy } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePageSeo } from "@/hooks/usePageSeo";

// ---------------------------------------------------------------------------
// Types (mirror the edge-function response shape; no client mutation.)
// ---------------------------------------------------------------------------

interface GrantRow {
  id: string;
  user_id: string;
  credits: number;
  kind: string | null;
  sku: string | null;
  source: string | null;
  environment: string | null;
  paddle_transaction_id: string | null;
  reverses: string | null;
  grant_ref: string | null;
  expires_at: string | null;
  created_at: string;
}

interface SpendRow {
  id: string;
  user_id: string;
  grow_id: string | null;
  period_key: string | null;
  weight: number | null;
  model_tier: string | null;
  feature: string | null;
  status: string | null;
  refund_of: string | null;
  created_at: string;
}

interface ReferralRow {
  id: string;
  referrer_user_id: string;
  referee_user_id: string | null;
  code: string | null;
  status: string | null;
  referrer_credits: number | null;
  referee_credits: number | null;
  environment: string | null;
  created_at: string;
  converted_at: string | null;
}

interface AuditResponse {
  grants: GrantRow[];
  spends: SpendRow[];
  refunds: SpendRow[];
  referrals: ReferralRow[];
  limit: number;
  environment: string | null;
  took_ms: number;
}

type EnvFilter = "all" | "live" | "sandbox";

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().replace("T", " ").replace("Z", "Z");
  } catch {
    return iso;
  }
}

function IdCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const short = value.length > 10 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value).catch(() => {})}
      title={`${value} (click to copy)`}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
    >
      {short}
      <Copy className="h-3 w-3 opacity-60" />
    </button>
  );
}

function EnvBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const isLive = value === "live";
  return (
    <Badge
      variant="outline"
      className={
        isLive
          ? "border-emerald-800 text-emerald-300"
          : "border-amber-800 text-amber-300"
      }
    >
      {value}
    </Badge>
  );
}

function StatusBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary" className="uppercase tracking-wide text-[10px]">
      {value}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Data hook — calls the operator-credits-audit edge function.
// ---------------------------------------------------------------------------

function useCreditsAudit(env: EnvFilter, nonce: number) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AuditResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data: resp, error: e } = await supabase.functions.invoke<AuditResponse>(
        "operator-credits-audit",
        { body: { limit: 200, environment: env === "all" ? null : env } },
      );
      if (cancelled) return;
      if (e) {
        setError(e.message);
        setData(null);
      } else {
        setData(resp ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [env, nonce]);

  return { loading, error, data };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function GrantsTable({ rows }: { rows: GrantRow[] }) {
  if (rows.length === 0) return <EmptyState label="No credit grants." />;
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left">
          <tr>
            <Th>Created</Th>
            <Th>Grant ID</Th>
            <Th>Owner</Th>
            <Th className="text-right">Credits</Th>
            <Th>Kind</Th>
            <Th>SKU</Th>
            <Th>Source</Th>
            <Th>Env</Th>
            <Th>Paddle Txn</Th>
            <Th>Reverses</Th>
            <Th>Ref</Th>
            <Th>Expires</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/40 align-top">
              <Td>{fmt(r.created_at)}</Td>
              <Td><IdCell value={r.id} /></Td>
              <Td><IdCell value={r.user_id} /></Td>
              <Td className="text-right font-mono">{r.credits}</Td>
              <Td>{r.kind ?? "—"}</Td>
              <Td>{r.sku ?? "—"}</Td>
              <Td>{r.source ?? "—"}</Td>
              <Td><EnvBadge value={r.environment} /></Td>
              <Td><IdCell value={r.paddle_transaction_id} /></Td>
              <Td><IdCell value={r.reverses} /></Td>
              <Td className="font-mono text-[11px] text-muted-foreground">{r.grant_ref ?? "—"}</Td>
              <Td>{fmt(r.expires_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendsTable({ rows }: { rows: SpendRow[] }) {
  if (rows.length === 0) return <EmptyState label="No spends." />;
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left">
          <tr>
            <Th>Created</Th>
            <Th>Spend ID</Th>
            <Th>Owner</Th>
            <Th>Grow</Th>
            <Th>Period</Th>
            <Th className="text-right">Wt</Th>
            <Th>Tier</Th>
            <Th>Feature</Th>
            <Th>Status</Th>
            <Th>Refund of</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/40 align-top">
              <Td>{fmt(r.created_at)}</Td>
              <Td><IdCell value={r.id} /></Td>
              <Td><IdCell value={r.user_id} /></Td>
              <Td><IdCell value={r.grow_id} /></Td>
              <Td className="font-mono">{r.period_key ?? "—"}</Td>
              <Td className="text-right font-mono">{r.weight ?? "—"}</Td>
              <Td>{r.model_tier ?? "—"}</Td>
              <Td>{r.feature ?? "—"}</Td>
              <Td><StatusBadge value={r.status} /></Td>
              <Td><IdCell value={r.refund_of} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferralsTable({ rows }: { rows: ReferralRow[] }) {
  if (rows.length === 0) return <EmptyState label="No referrals." />;
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left">
          <tr>
            <Th>Created</Th>
            <Th>Referral ID</Th>
            <Th>Referrer</Th>
            <Th>Referee</Th>
            <Th>Code</Th>
            <Th>Status</Th>
            <Th className="text-right">Referrer c</Th>
            <Th className="text-right">Referee c</Th>
            <Th>Env</Th>
            <Th>Converted</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/40 align-top">
              <Td>{fmt(r.created_at)}</Td>
              <Td><IdCell value={r.id} /></Td>
              <Td><IdCell value={r.referrer_user_id} /></Td>
              <Td><IdCell value={r.referee_user_id} /></Td>
              <Td className="font-mono">{r.code ?? "—"}</Td>
              <Td><StatusBadge value={r.status} /></Td>
              <Td className="text-right font-mono">{r.referrer_credits ?? 0}</Td>
              <Td className="text-right font-mono">{r.referee_credits ?? 0}</Td>
              <Td><EnvBadge value={r.environment} /></Td>
              <Td>{fmt(r.converted_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${className ?? ""}`}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 ${className ?? ""}`}>{children}</td>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-muted-foreground">{label}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OperatorCreditsAudit() {
  usePageSeo({
    title: "Credits Audit · Operator | Verdant Grow Diary",
    description: "Operator-only audit of credit grants, spends, refunds, and referral conversions.",
    path: "/operator/credits-audit",
    noindex: true,
  });

  const [env, setEnv] = useState<EnvFilter>("all");
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const { loading, error, data } = useCreditsAudit(env, nonce);

  const counts = useMemo(() => ({
    grants: data?.grants.length ?? 0,
    spends: data?.spends.length ?? 0,
    refunds: data?.refunds.length ?? 0,
    referrals: data?.referrals.length ?? 0,
  }), [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Credits &amp; referrals audit</h1>
          <p className="text-sm text-muted-foreground">
            Operator-only, read-only. Row IDs, timestamps, enums, and owner UUIDs only —
            no email, name, or profile fields.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={env} onValueChange={(v) => setEnv(v as EnvFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All envs</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="sandbox">Sandbox</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={reload} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">
            {error === "operator_required"
              ? "Operator role required."
              : `Failed to load: ${error}`}
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading audit data…
        </div>
      )}

      {!loading && data && (
        <>
          <div className="text-xs text-muted-foreground">
            Loaded in {data.took_ms}ms · limit {data.limit} rows per table
          </div>
          <Tabs defaultValue="grants">
            <TabsList>
              <TabsTrigger value="grants" className="gap-2">
                Grants <Badge variant="secondary">{counts.grants}</Badge>
              </TabsTrigger>
              <TabsTrigger value="spends" className="gap-2">
                Spends <Badge variant="secondary">{counts.spends}</Badge>
              </TabsTrigger>
              <TabsTrigger value="refunds" className="gap-2">
                Refunds <Badge variant="secondary">{counts.refunds}</Badge>
              </TabsTrigger>
              <TabsTrigger value="referrals" className="gap-2">
                Referrals <Badge variant="secondary">{counts.referrals}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="grants">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">AI credit grants</CardTitle>
                </CardHeader>
                <CardContent><GrantsTable rows={data.grants} /></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="spends">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">AI credit spends</CardTitle>
                </CardHeader>
                <CardContent><SpendsTable rows={data.spends} /></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="refunds">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Refunds (spends with refund_of set)</CardTitle>
                </CardHeader>
                <CardContent><SpendsTable rows={data.refunds} /></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="referrals">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Referral conversions</CardTitle>
                </CardHeader>
                <CardContent><ReferralsTable rows={data.referrals} /></CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
