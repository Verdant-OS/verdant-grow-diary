import { createFileRoute } from "@tanstack/react-router";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import GrowHelpToolkit from "@/pages/GrowHelpToolkit";

export const Route = createFileRoute("/tools/grow-help-toolkit")({
  head: () => staticRouteHead("/tools/grow-help-toolkit"),
  component: GrowHelpToolkit,
  errorComponent: LocalToolkitError,
});

function LocalToolkitError() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-semibold">The toolkit could not open</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Refresh the page to restore the last valid browser-local inputs. No calculator data was
          uploaded.
        </p>
      </div>
    </main>
  );
}
