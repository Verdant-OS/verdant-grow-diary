/**
 * preHydrationFormInput — keep text a visitor typed into a server-rendered
 * form before the page hydrated.
 *
 * react-hook-form's `register` writes each field's `defaultValues` entry into
 * the DOM when the field mounts. On an SSR page that mount happens at
 * hydration, so anything typed into the server-rendered field before then was
 * silently replaced with the default. Found on /feedback by the batched
 * core-link census (#1683): the census filled a field, hydration finished,
 * and the field read back "". A grower on a slow connection loses their text
 * the same way.
 *
 * `registerKeepingTypedText` wraps `register` for text inputs and textareas:
 * it reads the element's value before react-hook-form's ref runs, and when
 * that value differs from what the server rendered, it restores it through
 * `setValue` so the DOM and the form state agree.
 *
 * No React, no Supabase, no clock.
 */
import type {
  FieldPath,
  FieldValues,
  PathValue,
  RegisterOptions,
  UseFormRegisterReturn,
  UseFormReturn,
} from "react-hook-form";

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set(["checkbox", "radio", "file", "hidden"]);

/**
 * The value a visitor typed into a server-rendered text field before
 * hydration, or null when the field still holds what the server rendered
 * (or is not a text field).
 */
export function preHydrationTypedValue(element: unknown): string | null {
  if (!element || typeof element !== "object") return null;
  const field = element as { value?: unknown; defaultValue?: unknown; type?: unknown };
  if (typeof field.value !== "string" || typeof field.defaultValue !== "string") return null;
  if (typeof field.type === "string" && NON_TEXT_INPUT_TYPES.has(field.type)) return null;
  return field.value !== field.defaultValue ? field.value : null;
}

/** `register` for text fields that keeps text typed before hydration. */
export function registerKeepingTypedText<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, "register" | "getValues" | "setValue">,
) {
  return <N extends FieldPath<T>>(
    name: N,
    options?: RegisterOptions<T, N>,
  ): UseFormRegisterReturn<N> => {
    const registration = form.register(name, options);
    return {
      ...registration,
      ref: (element: unknown) => {
        // Read before react-hook-form's ref writes the default value.
        const typed = preHydrationTypedValue(element);
        registration.ref(element);
        // The comparison also keeps this a no-op on every later re-attach,
        // when the typed text already is the form value.
        if (typed !== null && typed !== form.getValues(name)) {
          form.setValue(name, typed as PathValue<T, N>, { shouldDirty: true });
        }
      },
    };
  };
}
