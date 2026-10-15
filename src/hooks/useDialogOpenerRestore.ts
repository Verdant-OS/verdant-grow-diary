import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Controlled dialogs have no Radix Trigger, so Escape would drop focus on
 * body. Remember the control that was focused when the dialog opened and
 * return focus to it from onCloseAutoFocus.
 */
export function useDialogOpenerRestore(open: boolean) {
  const openerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);

  return useCallback((event: Event) => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (!opener || !opener.isConnected) return;
    event.preventDefault();
    opener.focus();
  }, []);
}
