import type { Register } from "claude-code";

import { cacheLabel, shouldWarn } from "./clock";

export const register: Register = (on) => {
  let lastTurnAt: number | null = null;
  let warned = false;

  on("session.start", async ($, e, next) => {
    const started = await next(e);
    $.clock.every(60_000, async () => {
      if (lastTurnAt === null) return;
      const idle = (await $.clock.now()) - lastTurnAt;
      $.ui.status(cacheLabel(idle));
      if (shouldWarn(idle, warned)) {
        warned = true;
        $.ui.toast("Prompt cache goes cold in ~10 min");
      }
    });
    return started;
  });

  on("turn.complete", async ($, e, next) => {
    lastTurnAt = await $.clock.now();
    warned = false;
    $.ui.status(cacheLabel(0));
    return next(e);
  });
};
