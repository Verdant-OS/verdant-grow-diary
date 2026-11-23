// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://verdantgrowdiary.com/"}
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { writeAnalyticsConsent } from "@/lib/analyticsConsent";
import { FIRST_PAID_CONSENT_KEY } from "@/lib/firstPaidAnalyticsService";
import { setLocalStorageItemForTest } from "./helpers/localStorageTestHelper";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { useFirstPaidAnalytics } from "@/hooks/useFirstPaidAnalytics";

const account = "132f8c69-1905-44c5-afee-13420dbadd35";
const eventId = "9a95ecfa-0953-4640-97c1-966a2ffc7b1c";
const db = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: db.rpc, auth: { getSession: db.getSession } },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: account }, loading: false }) }));

const send = vi.fn<typeof fetch>();
const read = vi.fn();

function mount() {
  return renderHook(() => {
    const consent = useAnalyticsConsent();
    useFirstPaidAnalytics("/", consent.paidSince);
    return consent;
  });
}

function checkoutConfirmed() {
  window.dispatchEvent(
    new CustomEvent(PRICING_ANALYTICS_EVENT, {
      detail: { name: "subscription_activated", props: { plan: "staff", email: "ignore" } },
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_POSTHOG_KEY", "fixture-project-token");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
  vi.stubGlobal("fetch", send);
  send.mockReset().mockResolvedValue(new Response("1"));
  read.mockReset().mockResolvedValue({ data: null, error: null });
  db.rpc.mockReset().mockReturnValue({ abortSignal: read });
  db.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: account } } } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("first paid upgrade through the app consent and checkout hooks", () => {
  it("requires a new choice for a historical grant and clears it on withdrawal", async () => {
    writeAnalyticsConsent("granted");
    const view = mount();
    expect(view.result.current.paidSince).toBeNull();
    expect(db.rpc).not.toHaveBeenCalled();
    act(() => view.result.current.accept());
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith("get_my_first_paid_activation"));
    expect(view.result.current.paidSince).toBeGreaterThan(0);
    act(() => view.result.current.decline());
    expect(view.result.current.paidSince).toBeNull();
    db.rpc.mockClear();
    act(checkoutConfirmed);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("observes another tab reconfirming an existing grant", async () => {
    writeAnalyticsConsent("granted");
    const view = mount();
    const since = String(Date.now());
    setLocalStorageItemForTest(FIRST_PAID_CONSENT_KEY, since);
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", { key: FIRST_PAID_CONSENT_KEY, newValue: since }),
      ),
    );
    await waitFor(() => expect(view.result.current.paidSince).toBe(Number(since)));
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it("queues confirmation during the initial lookup and uses only the authenticated server receipt", async () => {
    let finish!: (result: { data: null; error: null }) => void;
    read.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    read.mockImplementationOnce(async () => ({
      data: { account_id: account, event_id: eventId, activated_at: new Date().toISOString() },
      error: null,
    }));
    const view = mount();
    act(() => view.result.current.accept());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    act(checkoutConfirmed);
    await act(async () => finish({ data: null, error: null }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(db.rpc.mock.calls).toEqual([
      ["get_my_first_paid_activation"],
      ["get_my_first_paid_activation"],
    ]);
    expect(db.getSession).toHaveBeenCalledTimes(1);
    const event = JSON.parse(String(send.mock.calls[0][1]?.body));
    expect(event).toMatchObject({
      distinct_id: account,
      event: "subscription_activated",
      uuid: eventId,
    });
    expect(event.properties).toEqual({
      $geoip_disable: true,
      $raw_user_agent: navigator.userAgent,
    });
    act(checkoutConfirmed);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("looks up again after an eligible navigation once the webhook lands", async () => {
    const view = renderHook(
      ({ path }: { path: string }) => {
        const consent = useAnalyticsConsent();
        useFirstPaidAnalytics(path, consent.paidSince);
        return consent;
      },
      { initialProps: { path: "/" } },
    );
    act(() => view.result.current.accept());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(send).not.toHaveBeenCalled();
    read.mockResolvedValueOnce({
      data: { account_id: account, event_id: eventId, activated_at: new Date().toISOString() },
      error: null,
    });
    view.rerender({ path: "/grows" });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    view.rerender({ path: "/tents" });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(send.mock.calls[0][1]?.body)).uuid).toBe(eventId);
  });

  it("drops a receipt after the session signs out during the lookup", async () => {
    read.mockImplementation(async () => ({
      data: { account_id: account, event_id: eventId, activated_at: new Date().toISOString() },
      error: null,
    }));
    db.getSession.mockResolvedValue({ data: { session: null } });
    const view = mount();
    act(() => view.result.current.accept());
    await waitFor(() => expect(db.getSession).toHaveBeenCalledTimes(1));
    expect(send).not.toHaveBeenCalled();
  });
});
