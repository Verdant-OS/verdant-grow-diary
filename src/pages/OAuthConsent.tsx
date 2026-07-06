/**
 * OAuth 2.1 consent route for the Verdant MCP server.
 *
 * Mounted at /.lovable/oauth/consent. Supabase's authorization server
 * redirects the user here to approve or deny an OAuth client (e.g.
 * ChatGPT, Claude, Cursor) that requested access via the MCP server.
 *
 * Presenter-only: no schema/RLS/Edge/AI/Action Queue writes. Read-only
 * consent orchestration through the app's existing browser Supabase
 * client. If the user is not signed in, we preserve the FULL consent URL
 * (path + query) so /auth returns them here after sign-in.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
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
        setError(
          "OAuth server is not enabled on this project. Please contact support.",
        );
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
      <div className="w-full max-w-md space-y-6 rounded-lg border p-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">
            Connect {clientName} to your Verdant account?
          </h1>
          <p className="text-sm text-muted-foreground">
            {clientName} will be able to use Verdant Grow OS tools as you. All
            available tools are read-only — no writes, no Action Queue
            approvals, and no device control.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1"
          >
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
