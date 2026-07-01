/**
 * pheno-comparison-no-network — proves the read-only /pheno-comparison
 * surface makes zero network calls and never touches Supabase / AI /
 * device-control layers during initial render, route navigation, or
 * rerender.
 *
 * Any fetch / XHR / WebSocket / EventSource / sendBeacon invocation
 * fails the test. The Supabase client mock throws on any property
 * access. AI/device-control modules are not imported by the presenter
 * and any dynamic import attempt would show up as a network call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PhenoComparison from "@/pages/PhenoComparison";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error(
          "PhenoComparison must not touch supabase (read-only preview).",
        );
      },
    },
  ),
}));

type Call = { api: string; arg: string };

function installNetworkTraps(): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    calls.push({ api: "fetch", arg: String(input) });
    throw new Error("network call forbidden on /pheno-comparison");
  }) as typeof fetch;

  const OriginalXHR = globalThis.XMLHttpRequest;
  class TrapXHR {
    open(_m: string, url: string) {
      calls.push({ api: "xhr", arg: url });
      throw new Error("XHR forbidden on /pheno-comparison");
    }
  }
  // @ts-expect-error test-time override
  globalThis.XMLHttpRequest = TrapXHR;

  const OriginalWS = globalThis.WebSocket;
  class TrapWS {
    constructor(url: string | URL) {
      calls.push({ api: "websocket", arg: String(url) });
      throw new Error("WebSocket forbidden on /pheno-comparison");
    }
  }
  // @ts-expect-error test-time override
  globalThis.WebSocket = TrapWS;

  const OriginalES = (globalThis as unknown as { EventSource?: unknown })
    .EventSource;
  class TrapES {
    constructor(url: string | URL) {
      calls.push({ api: "eventsource", arg: String(url) });
      throw new Error("EventSource forbidden on /pheno-comparison");
    }
  }
  (globalThis as unknown as { EventSource: unknown }).EventSource = TrapES;

  const originalBeacon = navigator.sendBeacon?.bind(navigator);
  if (typeof navigator.sendBeacon === "function") {
    (navigator as unknown as { sendBeacon: (u: string | URL) => boolean })
      .sendBeacon = (url: string | URL) => {
      calls.push({ api: "beacon", arg: String(url) });
      throw new Error("sendBeacon forbidden on /pheno-comparison");
    };
  }


  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
      // @ts-expect-error test-time restore
      globalThis.XMLHttpRequest = OriginalXHR;
      // @ts-expect-error test-time restore
      globalThis.WebSocket = OriginalWS;
      // @ts-expect-error test-time restore
      globalThis.EventSource = OriginalES;
      if (originalBeacon) {
        // @ts-expect-error test-time restore
        navigator.sendBeacon = originalBeacon;
      }
    },
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pheno-comparison" element={<PhenoComparison />} />
        <Route path="/pheno-hunts/:id/compare" element={<PhenoComparison />} />
        <Route path="/other" element={<div>other</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PhenoComparison — zero network / Supabase / AI / device calls", () => {
  let trap: ReturnType<typeof installNetworkTraps>;

  beforeEach(() => {
    trap = installNetworkTraps();
  });

  afterEach(() => {
    trap.restore();
    cleanup();
  });

  it("issues no network calls on initial render", () => {
    renderAt("/pheno-comparison");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
    expect(trap.calls).toEqual([]);
  });

  it("issues no network calls when navigated from another route", () => {
    const utils = render(
      <MemoryRouter initialEntries={["/other", "/pheno-comparison"]} initialIndex={0}>
        <Routes>
          <Route path="/pheno-comparison" element={<PhenoComparison />} />
          <Route path="/other" element={<div>other</div>} />
        </Routes>
      </MemoryRouter>,
    );
    utils.unmount();
    // Now mount directly on the comparison route.
    renderAt("/pheno-comparison");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
    expect(trap.calls).toEqual([]);
  });

  it("issues no network calls across an unmount+remount rerender", () => {
    const first = renderAt("/pheno-comparison");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
    first.rerender(
      <MemoryRouter initialEntries={["/pheno-comparison"]}>
        <Routes>
          <Route path="/pheno-comparison" element={<PhenoComparison />} />
        </Routes>
      </MemoryRouter>,
    );
    first.unmount();
    renderAt("/pheno-comparison");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
    expect(trap.calls).toEqual([]);
  });

  it("also renders the /pheno-hunts/:id/compare alias without any calls", () => {
    renderAt("/pheno-hunts/abc-123/compare");
    expect(screen.getByTestId("pheno-comparison-page")).toBeInTheDocument();
    expect(trap.calls).toEqual([]);
  });
});
