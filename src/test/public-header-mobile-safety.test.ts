import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..", "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const DENSE_PUBLIC_HEADERS = [
  "src/pages/CultivarsIndex.tsx",
  "src/pages/CultivarPage.tsx",
  "src/pages/Founder.tsx",
] as const;

const PUBLIC_HEADERS_USING_SHARED_COMPACTION = [
  "src/pages/Landing.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/HardwareIntegrations.tsx",
  "src/pages/GuidePage.tsx",
  "src/pages/GrowStageCareGuide.tsx",
  "src/pages/HowAiDoctorWorks.tsx",
  "src/pages/AiDoctorContextCheck.tsx",
  "src/pages/GuidesIndex.tsx",
  "src/pages/PublicVpdCalculator.tsx",
  "src/pages/Founder.tsx",
  "src/pages/CultivarsIndex.tsx",
  "src/pages/CultivarPage.tsx",
  "src/components/BetaLanding.tsx",
] as const;

describe("dense public headers on mobile", () => {
  it.each(DENSE_PUBLIC_HEADERS)("gives %s a dedicated mobile navigation row", (path) => {
    const source = read(path);

    expect(source).toMatch(/<header[^>]*className="[^"]*flex-wrap[^"]*gap-y-3[^"]*"/);
    expect(source).toMatch(
      /<nav[\s\S]*?className="[^"]*w-full[^"]*justify-between[^"]*sm:w-auto[^"]*sm:justify-start[^"]*"/,
    );
  });

  it.each(PUBLIC_HEADERS_USING_SHARED_COMPACTION)(
    "keeps %s on the shared compact-capable BrandLogo",
    (path) => {
      expect(read(path)).toMatch(/<BrandLogo\s+size="md"\s+showText\s*\/>/);
    },
  );

  it("lets long public CTA labels wrap instead of clipping at 320px", () => {
    for (const path of [
      "src/pages/HardwareIntegrations.tsx",
      "src/components/BetaLanding.tsx",
      "src/pages/Founder.tsx",
    ]) {
      const source = read(path);
      expect(source).toMatch(
        /min-h-11[^"\n]*max-w-full[^"\n]*h-auto[^"\n]*whitespace-normal[^"\n]*text-center/,
      );
    }
  });
});
