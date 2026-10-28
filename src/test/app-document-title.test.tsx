import { render } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { AppDocumentTitle } from "@/components/AppDocumentTitle";
import { appDocumentTitleForPath, appLayoutDocumentHead } from "@/lib/appDocumentTitleRules";
import { usePageSeo } from "@/hooks/usePageSeo";

const SITE_NAME = "Verdant Grow Diary";

const EXACT_TITLES: Record<string, string> = {
  "/plants": "Plants | Verdant Grow Diary",
  "/tents": "Tents | Verdant Grow Diary",
  "/grows": "Grows | Verdant Grow Diary",
  "/alerts": "Alerts | Verdant Grow Diary",
  "/actions": "Actions | Verdant Grow Diary",
  "/daily-check": "Daily Check | Verdant Grow Diary",
  "/doctor": "AI Doctor | Verdant Grow Diary",
  "/settings": "Settings | Verdant Grow Diary",
  "/reports": "Reports | Verdant Grow Diary",
  "/timeline": "Timeline | Verdant Grow Diary",
  "/sensors": "Sensors | Verdant Grow Diary",
  "/account/preferences": "Preferences | Verdant Grow Diary",
};

describe("app document titles", () => {
  it("names each signed-in page listed in #2004", () => {
    for (const [path, title] of Object.entries(EXACT_TITLES)) {
      expect(appDocumentTitleForPath(path)).toBe(title);
      expect(appLayoutDocumentHead([{ pathname: path }])).toEqual({
        meta: [{ title }],
      });
    }
  });

  it("names plant, tent, and grow detail pages without using the record id", () => {
    expect(appDocumentTitleForPath("/plants/plant-a")).toBe("Plant | Verdant Grow Diary");
    expect(appDocumentTitleForPath("/tents/tent-a")).toBe("Tent | Verdant Grow Diary");
    expect(appDocumentTitleForPath("/grows/grow-a")).toBe("Grow | Verdant Grow Diary");
  });

  it("leaves pages that already set a title alone", () => {
    expect(appDocumentTitleForPath("/dashboard")).toBeNull();
    expect(appDocumentTitleForPath("/pricing")).toBeNull();
    expect(appDocumentTitleForPath("/invite")).toBeNull();
    expect(appDocumentTitleForPath("/grows/grow-a/learning")).toBeNull();
    expect(appLayoutDocumentHead([{ pathname: "/dashboard" }])).toEqual({ meta: [] });
  });

  it("uses the deepest match pathname", () => {
    expect(appLayoutDocumentHead([{ pathname: "/_app" }, { pathname: "/plants" }])).toEqual({
      meta: [{ title: "Plants | Verdant Grow Diary" }],
    });
  });

  it("reapplies the next route title after usePageSeo resets the tab on unmount", () => {
    function DashboardSeo() {
      usePageSeo({
        title: "Grow Room Dashboard | Verdant Grow Diary",
        description: "Dashboard description for the title handoff test.",
        path: "/dashboard",
      });
      return null;
    }

    function Harness() {
      const [path, setPath] = useState("/dashboard");
      useEffect(() => {
        setPath("/plants");
      }, []);
      return (
        <>
          {path === "/dashboard" ? <DashboardSeo /> : null}
          <AppDocumentTitle pathname={path} />
        </>
      );
    }

    render(<Harness />);
    expect(document.title).toBe("Plants | Verdant Grow Diary");
    expect(document.title).not.toBe(SITE_NAME);
  });
});
