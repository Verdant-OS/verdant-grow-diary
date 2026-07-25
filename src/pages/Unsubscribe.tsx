import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Status = "validating" | "ready" | "already" | "invalid" | "confirming" | "success" | "error";

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const tokenRef = useRef(searchParams.get("token"));
  const token = tokenRef.current;
  const [status, setStatus] = useState<Status>("validating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  usePageSeo({
    title: "Unsubscribe | Verdant Grow Diary",
    description: "Confirm you want to stop receiving emails from Verdant Grow Diary.",
    path: "/unsubscribe",
    noindex: true,
  });

  useEffect(() => {
    let cancelled = false;

    // Keep the one-time token out of browser history, copied URLs, and later
    // same-page navigation as soon as React owns the route.
    if (token && typeof window !== "undefined") {
      try {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.hash}`,
        );
      } catch {
        // URL cleanup is defense-in-depth and must not block the request.
      }
    }

    async function validate() {
      if (!token) {
        setStatus("invalid");
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
          body: { token, action: "validate" },
        });
        if (error) throw error;
        const body = (data ?? {}) as {
          valid?: boolean;
          reason?: string;
        };
        if (cancelled) return;
        if (body.valid) {
          setStatus("ready");
        } else if (body.reason === "already_unsubscribed") {
          setStatus("already");
        } else {
          setStatus("invalid");
        }
      } catch {
        if (cancelled) return;
        setErrorMessage("We couldn't verify this link. Please try again.");
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
        body: { token, action: "unsubscribe" },
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
    } catch {
      setStatus("error");
      setErrorMessage("We couldn't process the unsubscribe. Please try again.");
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
                  Click confirm to stop receiving emails from Verdant Grow Diary at this address.
                  This only affects marketing and grow-update emails — we&rsquo;ll still send
                  critical account emails like password resets.
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
                This unsubscribe link is invalid or expired. Reply to the last email you received
                and I&rsquo;ll take care of it.
              </p>
            )}
            {status === "error" && (
              <p className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
                Something went wrong{errorMessage ? `: ${errorMessage}` : "."} Please try again in a
                moment.
              </p>
            )}
          </div>
          <div className="mt-6 text-xs text-muted-foreground">
            <Link to="/" className="underline" referrerPolicy="no-referrer">
              Return to Verdant
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
