// Standalone mount for the irrigation overflow proof. Touches NO app routing
// (App.tsx/routes.ts are frozen) — Vite serves this fixture directly. The writer
// is a no-op so no network/write occurs.
import React from "react";
import { createRoot } from "react-dom/client";
import { StructuredWateringEntry } from "@/components/irrigation/StructuredWateringEntry";
import "@/index.css";

const noopWriter = (async () => ({
  ok: true as const,
  eventId: "fixture",
  reused: false,
})) as never;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div data-testid="irrigation-fixture-root" style={{ maxWidth: "100%", padding: 12 }}>
      <StructuredWateringEntry
        growId="11111111-1111-4111-8111-111111111111"
        tentId="22222222-2222-4222-8222-222222222222"
        plantId="33333333-3333-4333-8333-333333333333"
        writer={noopWriter}
      />
    </div>
  </React.StrictMode>,
);
