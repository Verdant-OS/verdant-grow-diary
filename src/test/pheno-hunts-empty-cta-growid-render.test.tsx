/**
 * GDP-PHENO-EMPTY-CTA-GROWID-001 — Pheno Hunt empty-state CTA render pins.
 *
 * When /pheno-hunts already carries ?growId=, the empty CTA returns to that
 * grow. Unscoped stays bare /grows. Fail closed: never invent a growId.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { growDetailPath } from "@/lib/routes";
import {
  PHENO_HUNTS_EMPTY_CTA_SCOPED_LABEL,
  PHENO_HUNTS_EMPTY_CTA_UNSCOPED_HREF,
  PHENO_HUNTS_EMPTY_CTA_UNSCOPED_LABEL,
  PHENO_HUNTS_EMPTY_SCOPED_BODY,
  PHENO_HUNTS_EMPTY_UNSCOPED_BODY,
  resolvePhenoHuntsEmptyCta,
} from "@/lib/phenoHuntsIndexEmptyCtaRules";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";
const STORE_GROW = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const mockList = vi.fn();
vi.mock("@/lib/phenoHuntCandidatesService", () => ({
  listPhenoHuntsForOwner: () => mockList(),
}));

vi.mock("@/lib/phenoKeepersService", () => ({
  listKeeperStabilityForOwner: () => Promise.resolve([]),
}));

const growsStore = vi.hoisted(() => ({
  activeGrowId: null as string | null,
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ activeGrowId: growsStore.activeGrowId }),
}));

import PhenoHuntsIndex from "@/pages/PhenoHuntsIndex";

function renderEmpty(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhenoHuntsIndex />
    </MemoryRouter>,
  );
}

describe("resolvePhenoHuntsEmptyCta", () => {
  it("uses growDetailPath when growId is present", () => {
    expect(resolvePhenoHuntsEmptyCta(GROW)).toEqual({
      href: growDetailPath(GROW),
      label: PHENO_HUNTS_EMPTY_CTA_SCOPED_LABEL,
      body: PHENO_HUNTS_EMPTY_SCOPED_BODY,
    });
  });

  it("stays on /grows when growId is null or blank", () => {
    expect(resolvePhenoHuntsEmptyCta(null).href).toBe(PHENO_HUNTS_EMPTY_CTA_UNSCOPED_HREF);
    expect(resolvePhenoHuntsEmptyCta("").href).toBe(PHENO_HUNTS_EMPTY_CTA_UNSCOPED_HREF);
  });
});

describe("Pheno Hunt empty-state CTA grow-scoped render", () => {
  beforeEach(() => {
    mockList.mockResolvedValue([]);
    growsStore.activeGrowId = null;
  });

  it("returns to /grows/:id with grow-scoped copy when ?growId= is present", async () => {
    renderEmpty(`/pheno-hunts?growId=${GROW}`);

    const cta = await screen.findByTestId("pheno-hunts-index-empty-cta");
    expect(cta).toHaveAttribute("href", growDetailPath(GROW));
    expect(cta).toHaveTextContent(PHENO_HUNTS_EMPTY_CTA_SCOPED_LABEL);
    expect(screen.getByTestId("pheno-hunts-index-empty")).toHaveTextContent(
      PHENO_HUNTS_EMPTY_SCOPED_BODY,
    );
  });

  it("keeps bare /grows and unscoped copy when growId is absent", async () => {
    renderEmpty("/pheno-hunts");

    const cta = await screen.findByTestId("pheno-hunts-index-empty-cta");
    expect(cta).toHaveAttribute("href", PHENO_HUNTS_EMPTY_CTA_UNSCOPED_HREF);
    expect(cta).toHaveTextContent(PHENO_HUNTS_EMPTY_CTA_UNSCOPED_LABEL);
    expect(screen.getByTestId("pheno-hunts-index-empty")).toHaveTextContent(
      PHENO_HUNTS_EMPTY_UNSCOPED_BODY,
    );
  });

  it("fail-closed: whitespace growId does not invent a grow", async () => {
    renderEmpty("/pheno-hunts?growId=%20");

    const cta = await screen.findByTestId("pheno-hunts-index-empty-cta");
    expect(cta).toHaveAttribute("href", PHENO_HUNTS_EMPTY_CTA_UNSCOPED_HREF);
    expect(cta).toHaveTextContent(PHENO_HUNTS_EMPTY_CTA_UNSCOPED_LABEL);
  });

  it("fail-closed: empty growId query stays on /grows", async () => {
    renderEmpty("/pheno-hunts?growId=");

    const cta = await screen.findByTestId("pheno-hunts-index-empty-cta");
    expect(cta).toHaveAttribute("href", PHENO_HUNTS_EMPTY_CTA_UNSCOPED_HREF);
  });

  it("fail-closed: store activeGrowId is not used when the URL is unscoped", async () => {
    growsStore.activeGrowId = STORE_GROW;
    renderEmpty("/pheno-hunts");

    const cta = await screen.findByTestId("pheno-hunts-index-empty-cta");
    expect(cta).toHaveAttribute("href", PHENO_HUNTS_EMPTY_CTA_UNSCOPED_HREF);
    expect(cta.getAttribute("href")).not.toContain(STORE_GROW);
  });
});
