import { afterEach, describe, expect, it } from "vitest";

import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  grantedAnalyticsConsentHeaders,
} from "@/lib/analyticsConsent";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";
import {
  ANALYTICS_CONSENT_REQUEST_HEADER,
  analyticsConsentGranted,
  contentFreeAiProperties,
  countToolCalls,
  extractTokenUsage,
  sendContentFreeAiGeneration,
} from "@/lib/posthogAiObservabilityRules";

const PROMPT = "QUESTION: what is wrong with this leaf";
const PHOTO = "data:image/jpeg;base64,QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=";

function responseWithContent() {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: "The leaves look fine. " + PROMPT,
          tool_calls: [{ id: "call-1" }, { id: "call-2" }],
        },
      },
    ],
    usage: { prompt_tokens: 11, completion_tokens: 7 },
  };
}

describe("content-free AI observability", () => {
  afterEach(() => {
    clearLocalStorageForTest();
  });

  it("reads nested usage and counts tool calls when message content is null", () => {
    const providerResponse = {
      usage: { prompt_tokens: 4, completion_tokens: 2 },
      choices: [
        { message: { content: null, tool_calls: [{ id: "a" }, { id: "b" }, { id: "c" }] } },
      ],
    };
    expect(extractTokenUsage(providerResponse)).toEqual({ inputTokens: 4, outputTokens: 2 });
    expect(countToolCalls(providerResponse)).toBe(3);
    expect(
      extractTokenUsage({ usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 1 } }),
    ).toEqual({
      inputTokens: 9,
      outputTokens: 1,
    });
  });

  it("omits prompts, answers, and image bytes from the capture properties", () => {
    const properties = contentFreeAiProperties({
      distinctId: "user-1",
      sessionId: "session-1",
      traceId: "trace-1",
      spanName: "ai_coach",
      model: "gemini-test",
      provider: "gemini",
      providerResponse: {
        ...responseWithContent(),
        photo: PHOTO,
      },
      httpStatus: 200,
      startedAt: performance.now(),
    });
    const serialized = JSON.stringify(properties);
    expect(serialized).not.toContain(PROMPT);
    expect(serialized).not.toContain(PHOTO);
    expect(serialized).not.toContain("base64");
    expect(serialized).not.toContain("The leaves look fine");
    expect(properties.$ai_model).toBe("gemini-test");
    expect(properties.$ai_input_tokens).toBe(11);
    expect(properties.$ai_output_tokens).toBe(7);
    expect(properties.$ai_tool_call_count).toBe(2);
    expect(properties).not.toHaveProperty("$ai_input");
    expect(properties).not.toHaveProperty("$ai_output_choices");
    expect(properties).not.toHaveProperty("$ai_tools");
  });

  it("does not call PostHog unless the request grants analytics consent", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push([String(input), init ?? {}]);
      return new Response(null, { status: 200 });
    };
    const denied = new Request("https://example.test/ai-coach");
    const payload = {
      distinctId: "user-1",
      sessionId: "session-1",
      traceId: "trace-1",
      spanName: "ai_coach",
      model: "gemini-test",
      provider: "gemini",
      providerResponse: responseWithContent(),
      error: PROMPT,
      startedAt: performance.now() - 1000,
    };
    const transport = {
      fetch: fetchMock,
      endpoint: "https://us.i.posthog.com/i/v0/e/",
      apiKey: "phc_test",
    };
    await sendContentFreeAiGeneration(
      {
        ...payload,
        consentGranted: analyticsConsentGranted(
          denied.headers.get(ANALYTICS_CONSENT_REQUEST_HEADER),
        ),
      },
      transport,
    );
    expect(calls).toHaveLength(0);

    const granted = new Request("https://example.test/ai-coach", {
      headers: { [ANALYTICS_CONSENT_REQUEST_HEADER]: "granted" },
    });
    await sendContentFreeAiGeneration(
      {
        ...payload,
        consentGranted: analyticsConsentGranted(
          granted.headers.get(ANALYTICS_CONSENT_REQUEST_HEADER),
        ),
      },
      transport,
    );
    expect(calls).toHaveLength(1);
    const recorded = calls[0];
    if (!recorded) throw new Error("missing capture");
    const body = JSON.parse(String(recorded[1].body));
    expect(body.event).toBe("$ai_generation");
    expect(JSON.stringify(body.properties)).not.toContain(PROMPT);
    expect(body.properties.$ai_error).toBe("unclassified");
    expect(body.properties.$ai_tool_call_count).toBe(2);
    expect(body.properties.$ai_input_tokens).toBe(11);
  });

  it("adds the consent header only when local analytics consent is granted", () => {
    expect(grantedAnalyticsConsentHeaders()).toBeUndefined();
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "denied");
    expect(grantedAnalyticsConsentHeaders()).toBeUndefined();
    setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
    expect(grantedAnalyticsConsentHeaders("localhost")).toBeUndefined();
    expect(grantedAnalyticsConsentHeaders("verdantgrowdiary.com")).toEqual({
      [ANALYTICS_CONSENT_REQUEST_HEADER]: "granted",
    });
  });
});
