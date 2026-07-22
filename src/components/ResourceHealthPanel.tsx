import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_VERSION } from "@/generated/buildInfo";

type ResourceStatus = "pending" | "running" | "pass" | "fail";

interface RunSummary {
  ranAt: string;
  passing: number;
  failing: number;
  total: number;
  failures: { name: string; path: string; detail?: string }[];
}

const INTERVAL_STORAGE_KEY = "verdant.diagnostics.healthCheck.intervalMs";
const HISTORY_LIMIT = 10;

const INTERVAL_OPTIONS: { label: string; value: number }[] = [
  { label: "Off", value: 0 },
  { label: "Every 1 min", value: 60_000 },
  { label: "Every 5 min", value: 5 * 60_000 },
  { label: "Every 15 min", value: 15 * 60_000 },
];


interface ResourceCheck {
  name: string;
  path: string;
  /** Optional additional validation on the fetched response. */
  validate?: (res: Response, body: string) => Promise<string | void> | string | void;
  /** If true, response must be valid JSON. */
  json?: boolean;
  status: ResourceStatus;
  detail?: string;
  checkedAt?: string;
  durationMs?: number;
  httpStatus?: number;
}

const initial: ResourceCheck[] = [
  {
    name: "Build manifest",
    path: "/version.json",
    json: true,
    status: "pending",
    validate: async (_res, body) => {
      const data = JSON.parse(body) as { version?: unknown; buildTime?: unknown };
      if (typeof data.version !== "string" || !data.version) {
        return "missing `version` field";
      }
      if (typeof data.buildTime !== "string" || !data.buildTime) {
        return "missing `buildTime` field";
      }
      if (data.version !== APP_VERSION) {
        return `deployed ${data.version} vs bundled ${APP_VERSION}`;
      }
      return `version ${data.version}`;
    },
  },
  { name: "robots.txt", path: "/robots.txt", status: "pending" },
  {
    name: "sitemap.xml",
    path: "/sitemap.xml",
    status: "pending",
    validate: (_res, body) => {
      if (!body.includes("<urlset") && !body.includes("<sitemapindex")) {
        return "missing <urlset> / <sitemapindex> root";
      }
    },
  },
  {
    name: "Web app manifest",
    path: "/site.webmanifest",
    json: true,
    status: "pending",
  },
  { name: "Favicon", path: "/favicon.svg", status: "pending" },
];

function StatusBadge({ status }: { status: ResourceStatus }) {
  const variant =
    status === "pass"
      ? "default"
      : status === "fail"
        ? "destructive"
        : status === "running"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function ResourceHealthPanel() {
  const [checks, setChecks] = useState<ResourceCheck[]>(initial);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [intervalMs, setIntervalMs] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const raw = window.localStorage.getItem(INTERVAL_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return INTERVAL_OPTIONS.some((o) => o.value === parsed) ? parsed : 0;
  });
  const runningRef = useRef(false);



  const runAll = useCallback(async () => {
    setRunning(true);
    setChecks((prev) => prev.map((c) => ({ ...c, status: "running", detail: undefined })));

    const results = await Promise.all(
      initial.map(async (check): Promise<ResourceCheck> => {
        const t0 = performance.now();
        const checkedAt = new Date().toISOString();
        try {
          const res = await fetch(check.path, { cache: "no-store" });
          const body = await res.text();
          const durationMs = Math.round(performance.now() - t0);
          if (!res.ok) {
            return {
              ...check,
              status: "fail",
              detail: `HTTP ${res.status}`,
              httpStatus: res.status,
              checkedAt,
              durationMs,
            };
          }
          if (check.json) {
            try {
              JSON.parse(body);
            } catch (e) {
              return {
                ...check,
                status: "fail",
                detail: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
                httpStatus: res.status,
                checkedAt,
                durationMs,
              };
            }
          }
          let extra: string | void;
          if (check.validate) {
            extra = await check.validate(res, body);
          }
          return {
            ...check,
            status: "pass",
            detail: extra || `${body.length.toLocaleString()} bytes`,
            httpStatus: res.status,
            checkedAt,
            durationMs,
          };
        } catch (e) {
          return {
            ...check,
            status: "fail",
            detail: e instanceof Error ? e.message : String(e),
            checkedAt,
            durationMs: Math.round(performance.now() - t0),
          };
        }
      }),
    );

    setChecks(results);
    setLastRunAt(new Date().toISOString());
    setRunning(false);
  }, []);

  useEffect(() => {
    void runAll();
  }, [runAll]);

  const failing = checks.filter((c) => c.status === "fail").length;
  const passing = checks.filter((c) => c.status === "pass").length;

  return (
    <Card>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Static resource health</CardTitle>
          <Badge variant="outline">Diagnostics</Badge>
          {failing > 0 ? (
            <Badge variant="destructive">
              {failing} failing / {checks.length}
            </Badge>
          ) : (
            <Badge variant="secondary">
              {passing} / {checks.length} passing
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void runAll()} disabled={running} size="sm">
            {running ? "Checking…" : "Re-run checks"}
          </Button>
          {lastRunAt && (
            <span className="text-xs text-muted-foreground">
              Last run: {new Date(lastRunAt).toLocaleString()}
            </span>
          )}
        </div>

        <ul className="divide-y rounded-md border">
          {checks.map((c) => (
            <li key={c.path} className="p-3 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <code className="text-xs text-muted-foreground">{c.path}</code>
                </div>
                <StatusBadge status={c.status} />
              </div>
              {c.detail && (
                <p className="text-xs text-muted-foreground break-words">{c.detail}</p>
              )}
              <p className="text-[11px] text-muted-foreground opacity-80">
                {c.checkedAt ? new Date(c.checkedAt).toLocaleTimeString() : "—"}
                {typeof c.durationMs === "number" ? ` · ${c.durationMs} ms` : ""}
                {typeof c.httpStatus === "number" ? ` · HTTP ${c.httpStatus}` : ""}
              </p>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Fetches each resource with <code>cache: "no-store"</code> from the current origin.
          No auth, no writes, no secrets.
        </p>
      </CardContent>
    </Card>
  );
}

export default ResourceHealthPanel;
