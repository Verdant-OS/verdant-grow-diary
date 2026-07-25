import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Status =
  | "validating"
  | "ready"
  | "already"
  | "invalid"
  | "confirming"
  | "success"
  | "error";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("validating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    title: "Unsubscribe | Verdant Grow Diary",
    description: "Confirm you want to stop receiving emails from Verdant Grow Diary.",
    path: "/unsubscribe",
    robots: "noindex,nofollow",
  });

  useEffect(() => {
    let cancelled = false;
    async function validate() {
      if (!token) {
        setStatus("invalid");
        return;
      }
      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const body = (await response.json().catch(() => ({}))) as {
          valid?: boolean;
          reason?: string;
          error?: string;
        };
        if (cancelled) return;
        if (response.ok && body.valid) {
          setStatus("ready");
        } else if (body.reason === "already_unsubscribed") {
          setStatus("already");
        } else {
          setStatus("invalid");
        }
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }
    void validate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function confirmUnsubscribe() {
    if (!token) return;
    setStatus("confirming");
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { success?: boolean; reason?: string };
      if (payload.success) {
        setStatus("success");
      } else if (payload.reason === "already_unsubscribed") {
        setStatus("already");
      } else {
        setStatus("error");
        setErrorMessage("We couldn't process the unsubscribe. Please try again.");
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-16">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandLogo />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Email preferences</h1>
          <div className="mt-4 text-sm text-muted-foreground" aria-live="polite">
            {status === "validating" && (
              <p className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Checking your unsubscribe link…
              </p>
            )}
            {status === "ready" && (
              <>
                <p>
                  Click confirm to stop receiving emails from Verdant Grow Diary at
                  this address. This only affects marketing and grow-update emails —
                  we&rsquo;ll still send critical account emails like password resets.
                </p>
                <Button className="mt-5 w-full" onClick={confirmUnsubscribe}>
                  Confirm unsubscribe
                </Button>
              </>
            )}
            {status === "confirming" && (
              <p className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Updating your preferences…
              </p>
            )}
            {status === "success" && (
              <p className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
                You&rsquo;re unsubscribed. Sorry to see you go.
              </p>
            )}
            {status === "already" && (
              <p className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
                This email is already unsubscribed. No further action needed.
              </p>
            )}
            {status === "invalid" && (
              <p className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
                This unsubscribe link is invalid or expired. Reply to the last
                email you received and I&rsquo;ll take care of it.
              </p>
            )}
            {status === "error" && (
              <p className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
                Something went wrong{errorMessage ? `: ${errorMessage}` : "."} Please
                try again in a moment.
              </p>
            )}
          </div>
          <div className="mt-6 text-xs text-muted-foreground">
            <Link to="/" className="underline">Return to Verdant</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
