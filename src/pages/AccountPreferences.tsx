import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import PageHeader from "@/components/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CURRENT_AGREEMENTS, CURRENT_AGREEMENT_LIST, type AgreementType } from "@/constants/agreements";
import { buildAcceptanceRows, computeAgreementGaps, type AcceptanceRow, type AgreementGap } from "@/lib/agreementConsent";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export default function AccountPreferences() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<{
    agreement_type: AgreementType;
    version: string;
    effective_date: string;
    accepted_at: string;
  }[]>([]);
  const [agreementsLoading, setAgreementsLoading] = useState(true);
  const [agreementsError, setAgreementsError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<AgreementGap[]>([]);
  const [accepting, setAccepting] = useState(false);
  const [reconsentStatus, setReconsentStatus] = useState<string | null>(null);
  const [reconsentError, setReconsentError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("marketing_opt_in")
      .eq("user_id", user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError("Could not load your preferences.");
        } else {
          setOptIn(!!data?.marketing_opt_in);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setAgreementsLoading(true);
    supabase
      .from("user_agreement_acceptances")
      .select("agreement_type, version, effective_date, accepted_at")
      .eq("user_id", user.id)
      .order("accepted_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setAgreementsError("Could not load agreement history.");
        } else {
          const rows = (data as typeof agreements) ?? [];
          setAgreements(rows);
          setGaps(computeAgreementGaps(rows as unknown as AcceptanceRow[]));
        }
        setAgreementsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleToggle(next: boolean) {
    if (!user?.id || saving) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        marketing_opt_in: next,
        marketing_opt_in_at: next ? new Date().toISOString() : null,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      setError("Could not save your preference. Please try again.");
      return;
    }
    setOptIn(next);
    setStatus(next ? "Marketing opt-in enabled." : "Marketing opt-in disabled.");
  }

  async function handleAcceptAgreements() {
    if (!user?.id || accepting || gaps.length === 0) return;
    setAccepting(true);
    setReconsentError(null);
    setReconsentStatus(null);
    const rows = buildAcceptanceRows(user.id).map((r) => ({
      ...r,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }));
    const { error: err } = await supabase
      .from("user_agreement_acceptances")
      .upsert(rows, { onConflict: "user_id,agreement_type,version" });
    if (err) {
      setAccepting(false);
      setReconsentError("Couldn't record your acceptance. Please try again.");
      return;
    }
    // Reload history + gaps
    const { data, error: readErr } = await supabase
      .from("user_agreement_acceptances")
      .select("agreement_type, version, effective_date, accepted_at")
      .eq("user_id", user.id)
      .order("accepted_at", { ascending: false });
    setAccepting(false);
    if (readErr) {
      setReconsentError("Accepted, but couldn't refresh the list. Reload to see updates.");
      return;
    }
    const rowsRead = (data as typeof agreements) ?? [];
    setAgreements(rowsRead);
    setGaps(computeAgreementGaps(rowsRead as unknown as AcceptanceRow[]));
    setReconsentStatus("You're up to date on all current agreements.");
  }

  function labelForAgreementType(type: AgreementType): { label: string; href: string } {
    const agreement = CURRENT_AGREEMENTS[type];
    return {
      label: agreement?.label ?? type,
      href: agreement?.href ?? "#",
    };
  }

  return (
    <div>
      <PageHeader
        title="Preferences"
        description="Manage your account and communication settings."
        icon={<UserCircle className="h-5 w-5" />}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glass rounded-2xl border-0 shadow-none">
          <CardHeader className="p-5 pb-0">
            <CardTitle className="font-display font-semibold text-base">Marketing updates</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Product news, grow tips, and feature announcements from Verdant.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            {loading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Send me occasional product updates and grow tips</p>
                  <p className="text-xs text-muted-foreground">You can change this any time.</p>
                </div>
                <Switch
                  checked={optIn}
                  onCheckedChange={handleToggle}
                  disabled={saving}
                  aria-label="Marketing opt-in toggle"
                />
              </div>
            )}

            {status && (
              <p
                role="status"
                aria-live="polite"
                className="text-xs text-muted-foreground mt-3"
              >
                {status}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="text-xs text-destructive mt-3"
              >
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="glass rounded-2xl border-0 shadow-none">
          <CardHeader className="p-5 pb-0">
            <CardTitle className="font-display font-semibold text-base">Agreement history</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Versions you have accepted and when you accepted them.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            {agreementsLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : agreementsError ? (
              <p role="alert" className="text-xs text-destructive">
                {agreementsError}
              </p>
            ) : agreements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No accepted agreements on record.
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {agreements.map((a) => {
                  const { label, href } = labelForAgreementType(a.agreement_type);
                  return (
                    <li key={`${a.agreement_type}-${a.version}`} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <div>
                          <p className="text-sm font-medium">
                            <Link to={href} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                              {label}
                            </Link>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Version {a.version} · effective {a.effective_date}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground sm:text-right">
                          Accepted {formatSnapshotTimestamp(a.accepted_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
