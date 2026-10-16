import { describe, expect, it } from "vitest";

import { sameRealmEventDispatchInstalled } from "@/lib/sameRealmEventDispatch";

describe("dialog focus-scope dispatch", () => {
  it("installs same-realm dispatch when the dialog module loads", async () => {
    expect(sameRealmEventDispatchInstalled()).toBe(false);
    await import("@/components/ui/dialog");
    expect(sameRealmEventDispatchInstalled()).toBe(true);

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
