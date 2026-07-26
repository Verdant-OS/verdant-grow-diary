import { describe, expect, it } from "vitest";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  CULTIVAR_QA_SYSTEM_PROMPT as CLIENT_SYSTEM_PROMPT,
  buildCultivarQaContext,
} from "@/lib/cultivarQaGrounding";
import {
  CULTIVAR_QA_SYSTEM_PROMPT as SERVER_SYSTEM_PROMPT,
  SERVER_CULTIVAR_QA_CONTEXTS,
} from "../../supabase/functions/_shared/cultivarQaGrounding";

describe("cultivar Q&A server context parity", () => {
  it("pins the server-owned catalog to every published reference profile", () => {
    expect(Object.keys(SERVER_CULTIVAR_QA_CONTEXTS).sort()).toEqual(
      VERDANT_CULTIVARS.map((cultivar) => cultivar.slug).sort(),
    );

    for (const cultivar of VERDANT_CULTIVARS) {
      expect(SERVER_CULTIVAR_QA_CONTEXTS[cultivar.slug]).toBe(buildCultivarQaContext(cultivar));
    }
  });

  it("keeps the cautious prompt identical at the client and Edge boundaries", () => {
    expect(SERVER_SYSTEM_PROMPT).toBe(CLIENT_SYSTEM_PROMPT);
  });
});
