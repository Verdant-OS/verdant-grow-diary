import { describe, expect, it } from "vitest";
import {
  loadOpenEcowittCustomUploadClaim,
  type EcowittOpenClaimClient,
} from "@/lib/ecowittCustomUploadClaimService";

const TENT = "22222222-2222-4222-8222-222222222222";

function clientReturning(data: unknown, error: { message: string } | null): EcowittOpenClaimClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                is() {
                  return {
                    maybeSingle: async () => ({ data, error }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("EcoWitt open claim maybeSingle contract", () => {
  it("treats data null and a null error as no open claim", async () => {
    expect(await loadOpenEcowittCustomUploadClaim(clientReturning(null, null), TENT)).toEqual({
      ok: true,
      claim: null,
    });
  });

  it("fails closed when a row is present but is not an object", async () => {
    expect(await loadOpenEcowittCustomUploadClaim(clientReturning("claim", null), TENT)).toEqual({
      ok: false,
      reason: "malformed_response",
    });
  });
});
