import { describe, expect, it } from "vitest";

import { installSameRealmEventDispatch } from "@/lib/sameRealmEventDispatch";

describe("same-realm event dispatch", () => {
  it("delivers a foreign event to the node's document instead of throwing", () => {
    installSameRealmEventDispatch();
    const el = document.createElement("div");
    document.body.appendChild(el);
    let seen = 0;
    el.addEventListener("focusscope.unmount", () => {
      seen += 1;
    });
    const foreign = { type: "focusscope.unmount", bubbles: false, cancelable: true };
    expect(() => el.dispatchEvent(foreign as unknown as Event)).not.toThrow();
    expect(seen).toBe(1);
    el.remove();
  });
});
