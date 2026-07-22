import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APP_VERSION, buildInfo } from "@/generated/buildInfo";

interface VersionJson {
  version?: string;
  buildTime?: string;
  commit?: string;
  shortCommit?: string;
  ref?: string;
  tag?: string | null;
}

type FetchState =
  | { status: "loading" }
  | { status: "ok"; data: VersionJson }
  | { status: "error"; detail: string };

function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleString()} (${iso})`;
}

export function BuildInfoPanel() {
  const [remote, setRemote] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/version.json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as VersionJson;
        if (!cancelled) setRemote({ status: "ok", data });
      })
      .catch((err) => {
        if (!cancelled)
          setRemote({
            status: "error",
            detail: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bundled = APP_VERSION;
  const bundledBuildTime = buildInfo.buildTime;
  const remoteVersion =
    remote.status === "ok" ? remote.data.version ?? "—" : remote.status === "loading" ? "…" : "—";
  const remoteBuildTime =
    remote.status === "ok" ? remote.data.buildTime : undefined;

  type FieldDiff = {
    field: string;
    bundled: string | undefined;
    remote: string | undefined;
  };
  const fieldDiffs: FieldDiff[] = [];
  if (remote.status === "ok") {
    const compare: Array<[string, string | undefined, string | undefined]> = [
      ["version", bundled, remote.data.version],
      ["buildTime", bundledBuildTime, remote.data.buildTime],
      ["commit", buildInfo.commit, remote.data.commit],
      ["shortCommit", buildInfo.shortCommit, remote.data.shortCommit],
      ["ref", buildInfo.ref, remote.data.ref],
      ["tag", buildInfo.tag ?? undefined, remote.data.tag ?? undefined],
    ];
    for (const [field, b, r] of compare) {
      // Only flag when both sides have a value AND they differ. Missing values are ignored
      // to avoid noise when a field isn't stamped in one source.
      if (b && r && b !== r) fieldDiffs.push({ field, bundled: b, remote: r });
    }
  }
  const drift = fieldDiffs.length > 0;

  return (
    <Card>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">About this build</CardTitle>
          <Badge variant="outline">Diagnostics</Badge>
          {drift && <Badge variant="destructive">Version drift</Badge>}
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          <dt className="font-medium">Bundled APP_VERSION</dt>
          <dd className="font-mono break-all">{bundled}</dd>

          <dt className="font-medium">Bundled build time</dt>
          <dd className="font-mono break-all">{formatTime(bundledBuildTime)}</dd>

          <dt className="font-medium">Commit</dt>
          <dd className="font-mono break-all">
            {buildInfo.shortCommit}
            {buildInfo.dirty ? " (dirty)" : ""}
          </dd>

          <dt className="font-medium">Ref / tag</dt>
          <dd className="font-mono break-all">
            {buildInfo.tag ?? buildInfo.ref ?? "—"}
          </dd>

          <dt className="font-medium">/version.json version</dt>
          <dd className="font-mono break-all">{remoteVersion}</dd>

          <dt className="font-medium">/version.json build time</dt>
          <dd className="font-mono break-all">
            {remote.status === "loading"
              ? "…"
              : remote.status === "error"
                ? `error: ${remote.detail}`
                : formatTime(remoteBuildTime)}
          </dd>
        </dl>

        {drift && (
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-xs font-medium text-destructive">
              Version drift detected in {fieldDiffs.length} field
              {fieldDiffs.length === 1 ? "" : "s"}
            </p>
            <ul className="space-y-1 text-xs">
              {fieldDiffs.map((d) => (
                <li key={d.field} className="font-mono break-all">
                  <span className="font-semibold">{d.field}</span>: bundled=
                  <code>{d.bundled ?? "—"}</code> · remote=
                  <code>{d.remote ?? "—"}</code>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Remediation: hard-reload the page (Ctrl/Cmd+Shift+R) to fetch the newer
              bundle. If drift persists after reload, the deployment is mid-rollout or a
              CDN/service-worker cache is stale — purge the CDN cache for{" "}
              <code>/version.json</code> and the JS assets, or unregister the service
              worker under DevTools → Application.
            </p>
          </div>
        )}



        <p className="text-xs text-muted-foreground">
          Source: <code>src/generated/buildInfo.ts</code> (bundled at build time) and{" "}
          <code>/version.json</code> (served by the current deployment). No secrets.
        </p>
      </CardContent>
    </Card>
  );
}

export default BuildInfoPanel;
