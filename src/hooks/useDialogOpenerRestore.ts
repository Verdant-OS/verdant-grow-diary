import { useEffect, useLayoutEffect, useRef } from "react";

function clickedOpener(event: Event): HTMLElement | null {
  const raw = event.target;
  if (!(raw instanceof Element)) return null;
  const opener = raw.closest("button, a, [role='button']");
  return opener instanceof HTMLElement ? opener : null;
}

/**
 * Controlled dialogs have no Radix Trigger, so close drops focus on body.
 * Safari does not focus a button on click, so a pointer activation is remembered
 * from the clicked button. Keyboard activation still uses document.activeElement.
 */
export function useDialogOpenerRestore(open: boolean) {
  const openerRef = useRef<HTMLElement | null>(null);
  const clickedRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    function onClick(event: Event) {
      const opener = clickedOpener(event);
      if (!opener) return;
      clickedRef.current = opener;
      queueMicrotask(() => {
        if (clickedRef.current === opener) clickedRef.current = null;
      });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      const active = document.activeElement;
      const clicked = clickedRef.current;
      if (active instanceof HTMLElement && active !== document.body) {
        openerRef.current = active;
      } else if (clicked?.isConnected) {
        openerRef.current = clicked;
      } else {
        openerRef.current = null;
      }
      clickedRef.current = null;
    }
    wasOpenRef.current = open;
  }, [open]);

  return (event: { preventDefault: () => void }) => {
    const opener = openerRef.current;
    if (!opener || !opener.isConnected) return;
    event.preventDefault();
    opener.focus();
  };
}
