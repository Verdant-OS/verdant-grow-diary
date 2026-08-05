import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Webhook } from "lucide-react";
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
 *  - a copy-to-clipboard cURL example with an explicit bridge-token placeholder
 *
 * Presenter only — never reads or accepts a session JWT, never persists a
 * token, never writes to storage, no new schema. Webhook sensor ingest is
 * read-only. It never triggers alerts, the Action Queue, AI Doctor, or any
 * device control.
 */
export default function TentSensorWebhookSettingsCard({ tentId }: { tentId: string }) {
  const { toast } = useToast();
  const webhookUrl = buildSensorWebhookUrl(import.meta.env.VITE_SUPABASE_URL);
  const sources = getSupportedWebhookSourceLabels();

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

  const curlSnippet = buildSensorWebhookCurlExample({
    webhookUrl,
    tentId,
  });

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div
      className="glass rounded-2xl p-4 space-y-4"
      data-testid="tent-sensor-webhook-settings-card"
    >
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
            aria-label="Copy sensor webhook URL"
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
          <div className="text-xs font-medium text-muted-foreground">cURL example</div>
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
          Mint a tent-scoped token in <strong>Bridge tokens</strong>, copy it when it is shown once,
          then replace <code className="text-[11px]">&lt;VBT_BRIDGE_TOKEN&gt;</code> in this
          command. Store the real <code className="text-[11px]">vbt_…</code> value in your
          client&apos;s secret configuration — never in docs, screenshots, chat, or git.
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          App-session JWTs are not accepted by this endpoint. Bridge tokens are scoped to this tent,
          expiring, and revocable.
        </p>
      </div>
    </div>
  );
}
