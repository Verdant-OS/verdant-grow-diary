import { useEffect, useMemo, useState } from "react";
import { Download, Leaf, Printer, ShieldCheck } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import CycleBar from "@/components/grow-help/CycleBar";
import ExpenseCalculatorTab from "@/components/grow-help/ExpenseCalculatorTab";
import GrowHelpAboutPanel from "@/components/grow-help/GrowHelpAboutPanel";
import LightCalculatorTab from "@/components/grow-help/LightCalculatorTab";
import NutrientCalculatorTab from "@/components/grow-help/NutrientCalculatorTab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildGrowHelpToolkitCsv,
  buildGrowHelpToolkitPrintHtml,
  createGrowHelpExportSnapshot,
  downloadGrowHelpToolkitCsv,
  openGrowHelpToolkitPrintWindow,
} from "@/lib/growHelpToolkitExport";
import {
  convertGrowHelpUnitSystem,
  mergeLinkedLight,
  mergeLinkedNutrients,
} from "@/lib/growHelpToolkitCoordination";
import {
  createDefaultGrowHelpToolkitState,
  loadGrowHelpToolkitState,
  saveGrowHelpToolkitState,
  type ExpenseDeviceInputState,
  type ExpenseNutrientInputState,
  type GrowHelpToolkitState,
  type UnitSystem,
} from "@/lib/growHelpToolkitState";
import { Link } from "@/lib/react-router-compat";

type ToolkitTab = "nutrient" | "light" | "expense";
type SaveStatus = "saved" | "session_only";
type ExportStatus = "idle" | "downloaded" | "printed" | "unavailable";

function safeFileStem(value: string): string {
  const stem = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return stem || "grow-cycle";
}

export default function GrowHelpToolkit() {
  // Keep the server and first browser render identical, then restore this
  // browser's private plan after hydration. This avoids hydration mismatches
  // when localStorage already contains a previous cycle.
  const [state, setState] = useState<GrowHelpToolkitState>(createDefaultGrowHelpToolkitState);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<ToolkitTab>("nutrient");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [crossLinkMessage, setCrossLinkMessage] = useState("");

  useEffect(() => {
    setState(loadGrowHelpToolkitState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSaveStatus(saveGrowHelpToolkitState(state) ? "saved" : "session_only");
  }, [hydrated, state]);

  const exportSnapshot = useMemo(
    () => createGrowHelpExportSnapshot(state, "Prepared from browser-local inputs"),
    [state],
  );

  function changeUnitSystem(nextUnitSystem: UnitSystem) {
    setState((current) => convertGrowHelpUnitSystem(current, nextUnitSystem));
  }

  function pushLight(row: ExpenseDeviceInputState) {
    setState((current) => mergeLinkedLight(current, row));
    setCrossLinkMessage("Light plan copied to an editable Expense device row.");
    setActiveTab("expense");
  }

  function pushNutrients(rows: ExpenseNutrientInputState[]) {
    setState((current) => mergeLinkedNutrients(current, rows));
    setCrossLinkMessage(
      `${rows.length} recipe ${rows.length === 1 ? "part" : "parts"} copied to editable Expense rows.`,
    );
    setActiveTab("expense");
  }

  function downloadCsv() {
    const snapshot = {
      ...exportSnapshot,
      generatedLabel: new Date().toLocaleString(),
    };
    const result = downloadGrowHelpToolkitCsv(
      buildGrowHelpToolkitCsv(snapshot),
      `${safeFileStem(snapshot.cycleName)}-grow-help-toolkit.csv`,
    );
    setExportStatus(result === "downloaded" ? "downloaded" : "unavailable");
  }

  function printOnePager() {
    const snapshot = {
      ...exportSnapshot,
      generatedLabel: new Date().toLocaleString(),
    };
    const result = openGrowHelpToolkitPrintWindow(buildGrowHelpToolkitPrintHtml(snapshot));
    setExportStatus(result === "printed" ? "printed" : "unavailable");
  }

  return (
    <main
      data-testid="grow-help-toolkit-page"
      data-hydrated={hydrated ? "true" : "false"}
      className="min-h-screen min-w-0 bg-background text-foreground"
    >
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
            No account · no analytics · no upload
          </span>
          <span
            className="rounded-full border border-border/70 px-3 py-1.5"
            data-testid="grow-help-save-status"
          >
            {saveStatus === "saved"
              ? "Saved in this browser"
              : "Session only · storage unavailable"}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-4 pb-16 sm:px-6">
        <section className="max-w-4xl pt-5">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
            <Leaf aria-hidden="true" className="h-4 w-4" /> Grow Help Toolkit
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            One local plan for feed, light, and real costs.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            Enter what you actually mix, hang, run, and harvest. Results show their formula and
            units. Typical ranges are starting references—not guarantees, diagnoses, sensor
            readings, or yield promises.
          </p>
        </section>

        <CycleBar
          cycle={state.cycle}
          unitSystem={state.unitSystem}
          onChange={(cycle) => setState((current) => ({ ...current, cycle }))}
          onUnitSystemChange={changeUnitSystem}
        />

        {crossLinkMessage ? (
          <p
            role="status"
            className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm"
          >
            {crossLinkMessage}
          </p>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ToolkitTab)}
          className="min-w-0"
        >
          <TabsList
            className="grid h-auto w-full grid-cols-3 gap-1 p-1"
            aria-label="Toolkit calculators"
          >
            <TabsTrigger value="nutrient" className="min-h-11 min-w-0 px-1.5 sm:px-3">
              Nutrient
            </TabsTrigger>
            <TabsTrigger value="light" className="min-h-11 min-w-0 px-1.5 sm:px-3">
              Light
            </TabsTrigger>
            <TabsTrigger value="expense" className="min-h-11 min-w-0 px-1.5 sm:px-3">
              Expense
            </TabsTrigger>
          </TabsList>
          <TabsContent value="nutrient" className="mt-6 min-w-0">
            <NutrientCalculatorTab
              inputs={state.nutrient}
              unitSystem={state.unitSystem}
              onChange={(nutrient) => setState((current) => ({ ...current, nutrient }))}
              onPushRecipe={pushNutrients}
            />
          </TabsContent>
          <TabsContent value="light" className="mt-6 min-w-0">
            <LightCalculatorTab
              inputs={state.light}
              cycle={state.cycle}
              unitSystem={state.unitSystem}
              onChange={(light) => setState((current) => ({ ...current, light }))}
              onPushLight={pushLight}
            />
          </TabsContent>
          <TabsContent value="expense" className="mt-6 min-w-0">
            <ExpenseCalculatorTab
              inputs={state.expense}
              cycle={state.cycle}
              unitSystem={state.unitSystem}
              onChange={(expense) => setState((current) => ({ ...current, expense }))}
            />
          </TabsContent>
        </Tabs>

        <section className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Recipe and cost sheet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Export only what is currently complete. Incomplete sections remain clearly absent; no
              values are guessed.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={downloadCsv}
              className="h-auto min-h-11 whitespace-normal"
            >
              <Download aria-hidden="true" className="mr-2 h-4 w-4" /> Download CSV
            </Button>
            <Button
              type="button"
              onClick={printOnePager}
              className="h-auto min-h-11 whitespace-normal"
            >
              <Printer aria-hidden="true" className="mr-2 h-4 w-4" /> Print one-page sheet
            </Button>
          </div>
        </section>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {exportStatus === "downloaded"
            ? "CSV downloaded."
            : exportStatus === "printed"
              ? "Print view opened."
              : exportStatus === "unavailable"
                ? "Export could not open in this browser. Check download or pop-up permissions."
                : "CSV and print exports are created locally in your browser."}
        </p>

        <GrowHelpAboutPanel />
      </div>
    </main>
  );
}
