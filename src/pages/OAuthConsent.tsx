/**
 * OAuth 2.1 consent route for the Verdant MCP server.
 *
 * Mounted at /.lovable/oauth/consent. Supabase's authorization server
 * redirects the user here to approve or deny an OAuth client (e.g.
 * ChatGPT, Claude, Cursor) that requested access via the MCP server.
 *
 * Presenter-only: no schema/RLS/Edge/AI/Action Queue writes. Consent
 * orchestration uses the app's existing browser Supabase client. If the user
 * is not signed in, we preserve the FULL consent URL (path + query) so /auth
 * returns them here after sign-in.
 *
 * Important trust boundary: Verdant's currently exposed MCP TOOLS are
 * read-only, but the OAuth credential is still an authenticated account
 * credential. Until the credential is resource-bound, consent copy must not
 * imply the bearer itself is technically incapable of normal account writes
 * outside the MCP endpoint.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "@/lib/react-router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};

function getOAuthApi(): OAuthApi | null {
  const anyAuth = (supabase.auth as unknown as { oauth?: OAuthApi }).oauth;
  return anyAuth ?? null;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const oauth = getOAuthApi();
      if (!oauth) {
        setError("OAuth server is not enabled on this project. Please contact support.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Preserve the full consent URL so /auth returns the user here.
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?redirectTo=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    const oauth = getOAuthApi();
    if (!oauth) return;
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-10">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-xl font-semibold">Authorization request failed</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }
  if (!details) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-6 py-10">
        <p className="text-sm text-muted-foreground">Loading authorization request…</p>
      </main>
    );
  }

  const clientName = details.client?.name ?? "an external app";
  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md space-y-6 rounded-lg border p-6" data-testid="oauth-consent-card">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">Connect {clientName} to your Verdant account?</h1>
          <p className="text-sm text-muted-foreground" data-testid="oauth-consent-client-copy">
            <strong className="font-medium text-foreground">{clientName}</strong> is asking to
            connect to your signed-in grower account. Verdant&apos;s current MCP tools provide only
            the read-only operations listed below, and their queries remain limited by your
            account&apos;s existing access rules.
          </p>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm space-y-2" data-testid="oauth-consent-scope">
            <p className="font-medium text-foreground">What Verdant&apos;s MCP tools can read</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Your grows (names, stage, archive status, timestamps)</li>
              <li>Recent diary entries for grows you own</li>
              <li>Latest sensor snapshots for tents you own</li>
            </ul>
          </div>
          <div className="rounded-md border border-border px-3 py-2 text-sm space-y-2" data-testid="oauth-consent-safety">
            <p className="font-medium text-foreground">What Verdant&apos;s current MCP tools do not expose</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Diary or grow-record write tools</li>
              <li>Action Queue approval, dismissal, or editing tools</li>
              <li>AI Doctor or AI Coach execution tools</li>
              <li>Device, pump, light, fan, or automation controls</li>
            </ul>
          </div>
          <p
            className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground"
            data-testid="oauth-consent-credential-boundary"
          >
            Approval issues an authenticated account credential. Verdant does not currently
            enforce that credential as usable only at the MCP endpoint. Approve only a client you
            trust not to reuse it outside Verdant&apos;s MCP tools, where your normal signed-in account
            permissions may apply.
          </p>
          <p className="text-xs text-muted-foreground" data-testid="oauth-consent-revoke">
            Choose <strong className="font-medium text-foreground">Deny</strong> to cancel now.
            Verdant does not yet provide a self-service authorized-app disconnect screen. To
            request revocation of an approved client, contact {" "}
            <a
              href="/contact"
              className="font-medium text-foreground underline underline-offset-2"
              data-testid="oauth-consent-support-link"
            >
              Verdant Support
            </a>
            . Signing out is not presented as revoking the OAuth grant.
          </p>
        </div>
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
            Approve
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => decide(false)}
            className="flex-1"
          >
            Deny
          </Button>
        </div>
      </div>
    </main>
  );
}
