import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  notifyManualSensorCorrectionConfirmed,
  subscribeManualSensorCorrections,
} from "@/lib/manualSensorCorrectionEvents";

const channelName = "verdant:manual-sensor-corrections:v1";
const message = { version: 1, ownerId: "owner-a", tentId: "tent-a" };
class Channel {
  static instances = new Set<Channel>();
  static sent: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;
  constructor(readonly name: string) {
    Channel.instances.add(this);
  }
  postMessage(data: unknown) {
    Channel.sent.push(data);
    for (const receiver of Channel.instances) {
      if (receiver !== this && receiver.name === this.name && !receiver.closed)
        receiver.onmessage?.(new MessageEvent("message", { data }));
    }
  }
  close() {
    this.closed = true;
    Channel.instances.delete(this);
  }
}
const stops: Array<() => void> = [];
function observe(owner = "owner-a") {
  const refresh = vi.fn();
  stops.push(subscribeManualSensorCorrections(owner, refresh));
  return refresh;
}
beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", Channel);
  Channel.sent.length = 0;
});
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  Channel.instances.forEach((channel) => channel.close());
  vi.unstubAllGlobals();
});

it("refreshes the receiving owner's readers after another tab confirms a correction", () => {
  const refresh = observe();
  const otherOwner = observe("owner-b");
  const remote = new Channel(channelName);
  remote.postMessage(message);
  expect(refresh).toHaveBeenCalledExactlyOnceWith("other-tab");
  expect(otherOwner).not.toHaveBeenCalled();
  expect(Channel.sent).toEqual([message]); // No rebroadcast loop.
});

it("publishes only version and target identity, while notifying each local reader once", () => {
  const first = observe();
  const second = observe();
  const remote = new Channel(channelName);
  const receive = vi.fn();
  remote.onmessage = receive;
  notifyManualSensorCorrectionConfirmed("owner-a", "tent-a");
  expect(first).toHaveBeenCalledExactlyOnceWith("local");
  expect(second).toHaveBeenCalledExactlyOnceWith("local");
  expect(receive).toHaveBeenCalledTimes(1);
  expect(Channel.sent).toEqual([message]);
});

it("can publish from a tab that has no local reader, then closes its temporary channel", () => {
  const remote = new Channel(channelName);
  const receive = vi.fn();
  remote.onmessage = receive;
  notifyManualSensorCorrectionConfirmed("owner-a", "tent-a");
  expect(receive).toHaveBeenCalledTimes(1);
  expect(Channel.instances.size).toBe(1);
});

it.each([
  null,
  [],
  {},
  { ...message, version: 2 },
  { ...message, ownerId: null },
  { ...message, tentId: " " },
  { ...message, ownerId: "owner-b" },
])("ignores malformed, unsupported or foreign-owner messages: %j", (data) => {
  const refresh = observe();
  new Channel(channelName).postMessage(data);
  expect(refresh).not.toHaveBeenCalled();
});

it("removes a prior owner's subscription and closes the shared channel only after the last reader", () => {
  const oldOwner = observe();
  const second = observe();
  expect(Channel.instances.size).toBe(1);
  stops[0]();
  stops[0]();
  const remote = new Channel(channelName);
  remote.postMessage(message);
  expect(oldOwner).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  stops[1]();
  expect(Channel.instances.size).toBe(1);
  remote.postMessage(message);
  expect(second).toHaveBeenCalledOnce();
});

it("preserves same-tab confirmation when BroadcastChannel is unavailable", () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  const refresh = observe();
  expect(() => notifyManualSensorCorrectionConfirmed("owner-a", "tent-a")).not.toThrow();
  expect(refresh).toHaveBeenCalledOnce();
});

it("does not turn a confirmed save into failure when the browser denies the channel", () => {
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor() {
        throw new Error("denied");
      }
    },
  );
  const refresh = observe();
  expect(() => notifyManualSensorCorrectionConfirmed("owner-a", "tent-a")).not.toThrow();
  expect(refresh).toHaveBeenCalledOnce();
});

it("does not subscribe or broadcast when signed out or without a destination", () => {
  const refresh = vi.fn();
  stops.push(subscribeManualSensorCorrections(null, refresh));
  notifyManualSensorCorrectionConfirmed("", "tent-a");
  notifyManualSensorCorrectionConfirmed("owner-a", " ");
  expect(refresh).not.toHaveBeenCalled();
  expect(Channel.instances.size).toBe(0);
  expect(Channel.sent).toEqual([]);
});
