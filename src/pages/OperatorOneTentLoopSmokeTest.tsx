/**
 * Operator: One-Tent Loop Smoke Test checklist.
 *
 * Read-only, static checklist. No Supabase reads/writes, no rpc, no
 * functions.invoke, no AI calls, no alert writes, no Action Queue writes,
 * no device control, no POST to the local bridge, no fake live data.
 *
 * Mirrors docs/one-tent-loop-smoke-test.md.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";

interface ChecklistItem {
  label: string;
  verify: string;
  expected: string;
  route?: string;
}

interface ChecklistGroup {
  title: string;
  items: ChecklistItem[];
}

const GROUPS: ChecklistGroup[] = [
  {
    title: "Grow / Tent / Plant",
    items: [
      { label: "Grow exists", verify: "Operator has at least one Grow", expected: "Grow renders on /grows", route: "/grows" },
      { label: "Tent exists", verify: "A Tent under the Grow", expected: "Tent renders on /tents", route: "/tents" },
      { label: "Plant exists", verify: "A Plant under the Tent", expected: "Plant renders on /plants", route: "/plants" },
    ],
  },
  {
    title: "Quick Log",
    items: [
      {
        label: "Quick Log opens",
        verify: "Open Quick Log from Plant or Dashboard",
        expected: "Opens within ~1s; no crash; <30s flow",
      },
    ],
  },
  {
    title: "Timeline",
    items: [
      {
        label: "Recent diary/log evidence",
        verify: "Open Timeline for the Grow",
        expected: "Recent diary entries, photos, and log evidence visible",
        route: "/timeline",
      },
    ],
  },
  {
    title: "Sensor Snapshot",
    items: [
      {
        label: "Snapshot state correctness",
        verify: "Inspect Sensor Snapshot card",
        expected: "current / fresh / stale / missing rendered correctly; stale/invalid never reads healthy",
      },
      {
        label: "EcoWitt live reading (if bridge running)",
        verify: "Bridge forwarding succeeded recently",
        expected: 'source="live" row with vendor lineage in raw_payload',
        route: "/operator/ecowitt-bridge-status",
      },
    ],
  },
  {
    title: "AI Doctor Readiness",
    items: [
      {
        label: "Readiness panel renders evidence / missing context",
        verify: "Open AI Doctor readiness on Plant",
        expected: "Evidence + missing context shown. AI is NOT invoked automatically.",
      },
    ],
  },
  {
    title: "Action Queue Safety",
    items: [
      {
        label: "Approval-required",
        verify: "Any suggested action stays pending until grower approves",
        expected: "No auto-execution. No background writes.",
        route: "/actions",
      },
    ],
  },
  {
    title: "Sensor Truth / Provenance",
    items: [
      {
        label: "Canonical source labels only",
        verify: "Stored readings use live | manual | csv | demo | stale | invalid",
        expected: "EcoWitt vendor/transport lineage lives in raw_payload only",
      },
      {
        label: "No device control",
        verify: "No device commands sent",
        expected: "Verdant remains read-only for hardware in V0",
      },
    ],
  },
];

const SAFETY_RULES = [
  "No fake live data.",
  "Do not classify stale/invalid telemetry as healthy.",
  "AI Doctor readiness must not invoke AI by itself.",
  "Action Queue must remain approval-required.",
  "No device control.",
  "Grower approves actions.",
];

export default function OperatorOneTentLoopSmokeTest() {
  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">One-Tent Loop Smoke Test</h1>
        <p className="text-sm text-muted-foreground">
          Read-only operator checklist. Mirrors{" "}
          <code>docs/one-tent-loop-smoke-test.md</code>. No data is written by
          this page.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Safety rules</CardTitle>
          <CardDescription>Stop-ship if any rule is violated.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-6 space-y-1 text-sm">
            {SAFETY_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {group.items.map((item) => (
                <li key={item.label} className="border-l-2 border-muted pl-3">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-muted-foreground">Verify: {item.verify}</div>
                  <div className="text-muted-foreground">Expected: {item.expected}</div>
                  {item.route ? (
                    <div className="mt-1">
                      <Link to={item.route} className="text-primary underline">
                        {item.route}
                      </Link>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
