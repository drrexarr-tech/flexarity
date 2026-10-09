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