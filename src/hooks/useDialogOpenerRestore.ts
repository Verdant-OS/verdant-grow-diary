import { useLayoutEffect, useRef } from "react";

/**
 * Controlled dialogs have no Radix Trigger, so close drops focus on body.
 * Capture the opener when `open` flips true (before Radix moves focus) and
 * return it from `onCloseAutoFocus`.
 */
export function useDialogOpenerRestore(open: boolean) {
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
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
