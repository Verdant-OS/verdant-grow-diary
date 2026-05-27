import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Webhook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import {
  buildSensorWebhookCurlExample,
  buildSensorWebhookUrl,
  getSupportedWebhookSourceLabels,
} from "@/lib/sensorWebhookSettingsRules";

/**
 * Tent-scoped presenter for the read-only sensor webhook ingest.
 *
 * Surfaces:
 *  - the webhook URL
 *  - the supported `source` labels
 *  - a copy-to-clipboard cURL example using the user's current session token
 *
 * Presenter only — never persists the token, never writes to storage, no
 * new schema. Webhook sensor ingest is read-only. It never triggers
 * alerts, the Action Queue, AI Doctor, or any device control.
 */
export default function TentSensorWebhookSettingsCard({ tentId }: { tentId: string }) {
  const { toast } = useToast();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const webhookUrl = buildSensorWebhookUrl(import.meta.env.VITE_SUPABASE_URL);
  const sources = getSupportedWebhookSourceLabels();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSessionToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!webhookUrl) {
    return (
      <div className="glass rounded-2xl p-4" data-testid="tent-sensor-webhook-settings-card">
        <h2 className="font-display font-semibold mb-1">Sensor webhook</h2>
        <p className="text-sm text-muted-foreground">
          Webhook URL unavailable — backend not configured.
        </p>
      </div>
    );
  }

  // On-screen snippet ALWAYS uses a placeholder — never the live JWT (AUD-004).
  const curlSnippet = buildSensorWebhookCurlExample({
    webhookUrl,
    tentId,
    sessionToken,
  });

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const copyWithLiveToken = async () => {
    if (!sessionToken) {
      toast({ title: "Sign in to use your session token", variant: "destructive" });
      return;
    }
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "This copies a cURL command containing your live session token. " +
          "Session tokens are temporary and tied to this browser — do NOT paste " +
          "into docs, screenshots, chat, or shared notes. For long-running " +
          "Raspberry Pi / ESP32 / Node-RED clients, use a bridge token instead.\n\n" +
          "Continue?",
      );
    if (!confirmed) return;
    const withToken = buildSensorWebhookCurlExample({
      webhookUrl,
      tentId,
      sessionToken,
      revealToken: true,
    });
    await copy(withToken, "cURL with session token");
  };

  return (
    <div className="glass rounded-2xl p-4 space-y-4" data-testid="tent-sensor-webhook-settings-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-semibold flex items-center gap-2">
            <Webhook className="h-4 w-4" /> Sensor webhook
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Read-only ingest. Never triggers alerts, automation, or device control.
          </p>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Endpoint</div>
        <div className="flex items-center gap-2">
          <code
            className="text-xs bg-muted/50 rounded px-2 py-1 flex-1 break-all"
            data-testid="tent-sensor-webhook-url"
          >
            {webhookUrl}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy(webhookUrl, "Webhook URL")}
            data-testid="tent-sensor-webhook-copy-url"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Supported <code className="text-xs">source</code> labels
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="tent-sensor-webhook-sources">
          {sources.map((s) => (
            <Badge key={s.source} variant="secondary" title={s.hint} className="text-xs">
              <code className="font-mono">{s.source}</code>
              <span className="ml-1 text-muted-foreground">· {s.label}</span>
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-xs font-medium text-muted-foreground">
            cURL example
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy(curlSnippet, "cURL example")}
            data-testid="tent-sensor-webhook-copy-curl"
          >
            <Copy className="h-3 w-3 mr-1" /> Copy example
          </Button>
        </div>
        <pre
          className="text-xs bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all"
          data-testid="tent-sensor-webhook-curl"
        >
          {curlSnippet}
        </pre>
        <p className="text-[11px] text-muted-foreground mt-2">
          This example uses a <code className="text-[11px]">&lt;YOUR_SESSION_TOKEN&gt;</code>{" "}
          placeholder so it&apos;s safe to screenshot or paste into docs. Session JWTs are
          temporary and tied to this browser — never paste a live token into docs,
          screenshots, chat, or shared notes.
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          For long-running clients (Raspberry Pi, ESP32, Node-RED, Home Assistant),
          generate a <strong>bridge token</strong> instead — it&apos;s scoped to this tent
          and revocable.
        </p>
        <div className="mt-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-[11px] h-7 px-2"
            disabled={!sessionToken}
            onClick={copyWithLiveToken}
            data-testid="tent-sensor-webhook-copy-curl-with-token"
            title={
              sessionToken
                ? "Copies a one-time cURL with your live session token. Do not share."
                : "Sign in to enable"
            }
          >
            Copy with my session token (one-time, do not share)
          </Button>
        </div>
      </div>
    </div>
  );
}
