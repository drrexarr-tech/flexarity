import { z } from 'zod';

/**
 * The client sends null for fields it wants to clear, and an empty <input>
 * arrives as "". A plain `z.string().optional()` accepts neither: null is not
 * a string and not undefined, so every create came back as a validation error.
 *
 * Semantics that matter for both create and `.partial()` updates:
 *   key absent  -> undefined, meaning "leave unchanged"
 *   "" or null  -> null, meaning "clear this field"
 *   real value  -> stored as-is
 */
export const optionalText = () =>
  z.preprocess((v) => (v === '' ? null : v), z.string().nullable().optional());

/**
 * Same, for numbers. The coercion is deliberate but must not run on an empty
 * string: Number('') is 0, which would silently store a price of zero instead
 * of leaving the field empty.
 */
export const optionalNumber = () =>
  z.preprocess((v) => (v === '' ? null : v), z.coerce.number().nullable().optional());

/** Optional non-negative amount: prices, quantities, target sums. */
export const optionalAmount = (
  min = 0,
  message = 'Значение не может быть отрицательным'
) =>
  z.preprocess(
    (v) => (v === '' ? null : v),
    z.coerce.number().min(min, message).nullable().optional()
  );

/**
 * Optional link, restricted to http(s).
 *
 * A stored "javascript:" URL is stored XSS: the value lands in an href, and
 * clicking it runs attacker script in the app's own origin, where the access and
 * refresh tokens live in localStorage. `target="_blank" rel="noopener"` does not
 * help, because a javascript: href executes in the current document before any
 * navigation happens.
 */
export const httpUrl = () =>
  z.preprocess(
    // An empty input arrives as "" and means "clear this field", so it maps to
    // null exactly like optionalText does. Without this the refine below would
    // reject a cleared URL field as malformed.
    (v) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v),
    z
      .string()
      .refine(
        (v) => /^https?:\/\/[^\s]+$/i.test(v),
        'Ссылка должна начинаться с http:// или https://'
      )
      .nullable()
      .optional()
  );