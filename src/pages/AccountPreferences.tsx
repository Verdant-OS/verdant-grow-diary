import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import PageHeader from "@/components/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CURRENT_AGREEMENTS, type AgreementType } from "@/constants/agreements";

export default function AccountPreferences() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      </div>
    </div>
  );
}
