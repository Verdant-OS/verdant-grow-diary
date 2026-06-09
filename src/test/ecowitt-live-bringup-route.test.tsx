/**
 * EcoWitt Live Bring-Up route tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import EcowittLiveBringup from "@/pages/EcowittLiveBringup";
import {
  ECOWITT_BRINGUP_STEP_IDS,
  ECOWITT_BRINGUP_COMMAND_IDS,
  ECOWITT_BRINGUP_EVIDENCE_IDS,
  ECOWITT_BRINGUP_GO_NO_GO_IDS,
} from "@/lib/ecowittLiveBringupViewModel";

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/operator/ecowitt-live-bringup"]}>
      <Routes>
        <Route
          path="/operator/ecowitt-live-bringup"
          element={<EcowittLiveBringup />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const FORBIDDEN_COPY = [
  "Execute",
  "Run command",
  "Send command",
  "Control device",
  "Turn on",
  "Turn off",
  "Set fan",
  "Set light",
  "Dose",
  "Flush immediately",
  "Guaranteed",
  "Definitely",
  "Certainly",
];

describe("EcowittLiveBringup route page", () => {
  it("renders at /operator/ecowitt-live-bringup", () => {
    renderRoute();
    expect(screen.getByTestId("ecowitt-bringup-page")).toBeInTheDocument();
  });

  it("shows operator / read-only / no-live / no-write / no-model / no-device badges", () => {
    renderRoute();
    const expected = [
      "Operator checklist",
      "Read-only",
      "No live data queries",
      "No database writes",
      "No model calls",
      "No device control",
    ];
    expected.forEach((label, i) => {
      expect(
        screen.getByTestId(`ecowitt-bringup-badge-${i}`),
      ).toHaveTextContent(label);
    });
  });

  it("renders the top safety note", () => {
    renderRoute();
    const note = screen.getByTestId("ecowitt-bringup-top-note");
    expect(note).toHaveTextContent(/does not query sensors/i);
    expect(note).toHaveTextContent(/does not prove live data/i);
  });

  it("shows overall status blocked", () => {
    renderRoute();
    expect(
      screen.getByTestId("ecowitt-bringup-overall-status"),
    ).toHaveTextContent("blocked");
  });

  it("renders all checklist steps in order", () => {
    renderRoute();
    for (const id of ECOWITT_BRINGUP_STEP_IDS) {
      expect(
        screen.getByTestId(`ecowitt-bringup-step-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders all command cards", () => {
    renderRoute();
    for (const id of ECOWITT_BRINGUP_COMMAND_IDS) {
      expect(
        screen.getByTestId(`ecowitt-bringup-command-${id}`),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`ecowitt-bringup-command-${id}-text`),
      ).toBeInTheDocument();
    }
  });

  it("renders all evidence fields", () => {
    renderRoute();
    for (const id of ECOWITT_BRINGUP_EVIDENCE_IDS) {
      expect(
        screen.getByTestId(`ecowitt-bringup-evidence-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders all GO/NO-GO rules", () => {
    renderRoute();
    for (const id of ECOWITT_BRINGUP_GO_NO_GO_IDS) {
      expect(
        screen.getByTestId(`ecowitt-bringup-go-no-go-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders source truth warnings", () => {
    renderRoute();
    const list = screen.getByTestId("ecowitt-bringup-source-truth-warnings");
    expect(list.textContent ?? "").toMatch(/not call data live/i);
    expect(list.textContent ?? "").toMatch(/grower approval/i);
  });

  it("renders tonight notes", () => {
    renderRoute();
    expect(
      screen.getByTestId("ecowitt-bringup-tonight-notes"),
    ).toBeInTheDocument();
  });

  it("renders the generated_at footer", () => {
    renderRoute();
    expect(
      screen.getByTestId("ecowitt-bringup-generated-at"),
    ).toBeInTheDocument();
  });

  it("renders no inputs", () => {
    renderRoute();
    expect(document.querySelectorAll("input").length).toBe(0);
    expect(document.querySelectorAll("textarea").length).toBe(0);
    expect(document.querySelectorAll("select").length).toBe(0);
  });

  it("renders no buttons", () => {
    renderRoute();
    expect(document.querySelectorAll("button").length).toBe(0);
  });

  it("does not contain forbidden execution copy", () => {
    renderRoute();
    const text = document.body.textContent ?? "";
    for (const phrase of FORBIDDEN_COPY) {
      expect(text).not.toMatch(new RegExp(phrase, "i"));
    }
  });

  it("does not contain fake live success copy", () => {
    renderRoute();
    const text = (document.body.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/\blive verified\b/);
    expect(text).not.toMatch(/\bproven live\b/);
    expect(text).not.toMatch(/\bverified live\b/);
    // Overall status must not default to ready
    expect(
      screen.getByTestId("ecowitt-bringup-overall-status").textContent,
    ).not.toMatch(/ready/i);
  });
});
