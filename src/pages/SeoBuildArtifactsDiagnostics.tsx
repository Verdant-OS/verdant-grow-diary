import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inspectSeoBuildArtifacts } from "@/lib/seoBuildArtifacts.functions";
import type { SeoArtifactStatus, SeoBuildArtifactReport } from "@/lib/seoBuildArtifactRules";

function statusVariant(status: SeoArtifactStatus): "default" | "destructive" | "secondary" {
  if (status === "PASS") return "default";
  if (status === "FAIL") return "destructive";
  return "secondary";
}

export default function SeoBuildArtifactsDiagnostics() {
  const inspect = useServerFn(inspectSeoBuildArtifacts);
  const [report, setReport] = useState<SeoBuildArtifactReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await inspect());
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [inspect]);

  useEffect(() => {
    void load();
  }, [load]);

  const missing = useMemo(
    () => (report ? report.documents.filter((d) => !d.present) : []),
    [report],
  );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">SEO build artifacts</h1>
        <p className="text-sm text-muted-foreground">
          Read-only check of the current build output: does{" "}
          <code className="font-mono">seo-manifest.json</code> exist, and is every
          staticSocialRouteDocuments output document present? Nothing here regenerates or
          repairs artifacts.
        </p>
      </header>

      <div className="flex items-center gap-3">
        <Button onClick={() => void load()} disabled={loading} size="sm">
          {loading ? "Checking…" : "Re-check"}
        </Button>
        {report ? (
          <Badge variant={statusVariant(report.status)}>{report.status}</Badge>
        ) : null}
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">BLOCKED — inspection failed</CardTitle>
            <CardDescription className="break-words">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {loading && !report ? (
        <p className="text-sm text-muted-foreground">Reading build output…</p>
      ) : null}

      {report ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
              <CardDescription>
                Checked {report.checkedAt} · output directory{" "}
                <code className="font-mono break-all">{report.distDir}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {report.blockedReason ? (
                <p className="text-muted-foreground">{report.blockedReason}</p>
              ) : (
                <p>
                  {report.presentCount} artifact(s) present, {report.missingCount} missing.
                </p>
              )}
              <p>
                <span className="text-muted-foreground">seo-manifest.json: </span>
                {report.manifest
                  ? report.manifest.present
                    ? `present (${report.manifest.bytes ?? 0} bytes)`
                    : "MISSING"
                  : "not inspected"}
              </p>
              <p className="text-muted-foreground">
                Expected documents: {report.documents.length}
              </p>
            </CardContent>
          </Card>

          {missing.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Missing documents ({missing.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 font-mono text-xs">
                  {missing.map((entry) => (
                    <li key={entry.file}>{entry.file}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {report.documents.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All expected outputs</CardTitle>
                <CardDescription>
                  Produced by generate-seo-artifacts + capture-ssr-head-snapshots.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-xs">
                  {report.documents.map((entry) => (
                    <li key={entry.file} className="flex items-center justify-between gap-3">
                      <span className="font-mono break-all">{entry.file}</span>
                      <span
                        className={
                          entry.present ? "text-muted-foreground" : "font-medium text-destructive"
                        }
                      >
                        {entry.present ? `${entry.bytes ?? 0} B` : "missing"}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
