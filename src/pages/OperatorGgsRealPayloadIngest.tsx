/**
 * Operator: Spider Farmer GGS real-payload ingest.
 *
 * Dev/operator-only screen, behind:
 *   1. AppShell auth gate (route is inside the protected layout in App.tsx).
 *   2. Server-side `has_role(auth.uid(), 'admin')` check via useHasRole.
 *
 * If the role check is loading, denied, or errors, the ingest panel is NOT
 * rendered — a blocked screen is shown instead. This page can write live
 * sensor telemetry through the existing validated ingest path, so we do not
 * rely on /operator/* routing alone.
 *
 * NEVER renders raw_payload. NEVER emits alerts / Action Queue / AI / device
 * control side effects.
 */
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ShieldOff } from "lucide-react";
import GgsRealPayloadIngestPanel from "@/components/GgsRealPayloadIngestPanel";
import GgsSentinelSmokeRunnerPanel from "@/components/GgsSentinelSmokeRunnerPanel";
import { useHasRole } from "@/hooks/useHasRole";

export default function OperatorGgsRealPayloadIngest() {
  const role = useHasRole("operator");
  useEffect(() => { document.title = "Operator · GGS real-payload ingest"; }, []);

  return (
    <div className="container mx-auto max-w-3xl space-y-4 p-4">



      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Spider Farmer GGS real-payload ingest</h1>
        <p className="text-sm text-muted-foreground">
          Dev/operator-only. Routes one real GGS 3-in-1 Soil Sensor Pro payload through the
          existing validated ingest path. No new write path. No raw payload rendering.
        </p>
      </header>

      {role.status === "loading" && (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking operator permissions…
          </CardContent>
        </Card>
      )}

      {(role.status === "denied" || role.status === "unauthenticated") && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldOff className="h-5 w-5 text-destructive" />
              <CardTitle>Operator access required</CardTitle>
            </div>
            <CardDescription>
              This screen is restricted to operators with the <code>admin</code> role.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            If you believe this is a mistake, ask an existing admin to grant the role.
          </CardContent>
        </Card>
      )}

      {role.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Could not verify operator role</AlertTitle>
          <AlertDescription>
            {role.error ?? "Role check failed."} The ingest panel is disabled.
          </AlertDescription>
        </Alert>
      )}

      {role.status === "granted" && (
        <>
          <GgsRealPayloadIngestPanel />
          <GgsSentinelSmokeRunnerPanel />
        </>
      )}
    </div>
  );
}
