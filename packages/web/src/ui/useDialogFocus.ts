import { useEffect, useRef, type RefObject } from "react";

/** Keep modal keyboard navigation inside the dialog and restore the opener. */
export function useDialogFocus(
  open: boolean,
  container: RefObject<HTMLElement>,
  onEscape?: () => void,
) {
  const escapeHandler = useRef(onEscape);
  useEffect(() => {
    escapeHandler.current = onEscape;
  }, [onEscape]);
  useEffect(() => {
    const dialog = container.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
        ),
      ).filter((element) => {
        if (!element.getClientRects().length) return false;
        if (!(element instanceof HTMLInputElement) || element.type !== "radio" || !element.name)
          return true;
        const group = Array.from(
          dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
        ).filter(
          (radio) =>
            radio.name === element.name && !radio.disabled && radio.getClientRects().length > 0,
        );
        return element === (group.find((radio) => radio.checked) ?? group[0]);
      });
    focusable()[0]?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && escapeHandler.current) {
        event.preventDefault();
        escapeHandler.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      const outside = !dialog.contains(document.activeElement);
      if (
        outside ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, container]);
}
