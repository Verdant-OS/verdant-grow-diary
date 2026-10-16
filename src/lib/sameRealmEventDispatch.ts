/**
 * Radix FocusScope dispatches its unmount CustomEvent from a setTimeout.
 * That event is built with whichever CustomEvent the timer's realm sees.
 * jsdom rejects it when the realm is not the node's document
 * ("parameter 1 is not of type 'Event'"), which fails the Vitest file even
 * after every assertion passed. Clone into the node's document and retry.
 */

let installed = false;

export function sameRealmEventDispatchInstalled(): boolean {
  return installed;
}

export function installSameRealmEventDispatch(): void {
  if (installed || typeof EventTarget === "undefined") return;
  installed = true;
  const native = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (this: EventTarget, event: Event): boolean {
    try {
      return native.call(this, event);
    } catch (error) {
      // jsdom throws its own realm's TypeError, which fails `instanceof Error` here.
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
      if (!message.includes("parameter 1 is not of type 'Event'")) throw error;
      const ownerDocument = (this as { ownerDocument?: Document | null }).ownerDocument;
      const view = ownerDocument?.defaultView ?? null;
      const CustomEventCtor = view?.CustomEvent;
      // The node outlived its document (FocusScope's unmount timer vs teardown).
      if (!CustomEventCtor || !isEventLike(event)) return false;
      const cloned = new CustomEventCtor(event.type, {
        bubbles: event.bubbles,
        cancelable: event.cancelable,
      });
      return native.call(this, cloned);
    }
  };
}

function isEventLike(event: Event): boolean {
  return typeof event?.type === "string";
}
