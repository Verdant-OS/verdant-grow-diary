/** Refresh signals only; readers must reload through their own authenticated path. */
export const MANUAL_SENSOR_CORRECTION_CONFIRMED_EVENT = "verdant:sensor-reading-corrected";
const CHANNEL_NAME = "verdant:manual-sensor-corrections:v1";
type Origin = "local" | "other-tab";
let channel: BroadcastChannel | null = null;
let subscribers = 0;

function isTarget(value: unknown): value is { ownerId: string; tentId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Record<string, unknown>;
  return (
    typeof target.ownerId === "string" &&
    !!target.ownerId.trim() &&
    typeof target.tentId === "string" &&
    !!target.tentId.trim()
  );
}

function dispatch(target: { ownerId: string; tentId: string }, origin: Origin): void {
  window.dispatchEvent(
    new CustomEvent(MANUAL_SENSOR_CORRECTION_CONFIRMED_EVENT, {
      detail: { ownerId: target.ownerId, tentId: target.tentId, origin },
    }),
  );
}

function openChannel(): BroadcastChannel | null {
  try {
    return typeof window.BroadcastChannel === "function"
      ? new window.BroadcastChannel(CHANNEL_NAME)
      : null;
  } catch {
    // Browser restrictions must not turn a confirmed write into a failed save.
    return null;
  }
}

function closeChannel(value: BroadcastChannel | null): void {
  try {
    value?.close();
  } catch {
    /* Best-effort transport cleanup. */
  }
}

export function notifyManualSensorCorrectionConfirmed(ownerId: string, tentId: string): void {
  if (typeof window === "undefined" || !ownerId.trim() || !tentId.trim()) return;
  dispatch({ ownerId, tentId }, "local");
  // Reuse the receiver's channel: BroadcastChannel excludes the sending channel,
  // so multiple local subscribers never receive a second, echoed notification.
  const sender = channel ?? openChannel();
  try {
    sender?.postMessage({ version: 1, ownerId, tentId });
  } catch {
    // Signals contain no reading values and are never save receipts.
  } finally {
    if (sender !== channel) closeChannel(sender);
  }
}

export function subscribeManualSensorCorrections(
  ownerId: string | null,
  refresh: (origin: Origin) => void,
): () => void {
  if (typeof window === "undefined" || !ownerId?.trim()) return () => {};
  const listener = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!isTarget(detail) || detail.ownerId !== ownerId) return;
    refresh((detail as Record<string, unknown>).origin === "other-tab" ? "other-tab" : "local");
  };
  window.addEventListener(MANUAL_SENSOR_CORRECTION_CONFIRMED_EVENT, listener);
  subscribers++;
  if (!channel) {
    channel = openChannel();
    if (channel)
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (isTarget(data) && (data as Record<string, unknown>).version === 1)
          dispatch(data, "other-tab"); // Never rebroadcast received signals.
      };
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener(MANUAL_SENSOR_CORRECTION_CONFIRMED_EVENT, listener);
    if (--subscribers === 0) {
      closeChannel(channel);
      channel = null;
    }
  };
}
