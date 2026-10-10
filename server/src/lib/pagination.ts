/**
 * Pagination bounds.
 *
 * Math.min(-1, 50) is -1, so a negative take reached Prisma, raised a
 * validation error, and surfaced as a 500 instead of a 400. Bounds are applied
 * here so the rule lives in one place.
 */
export function pageBounds(
  skip: unknown,
  take: unknown,
  defaultTake = 20,
  maxTake = 50
): { skip: number; take: number } {
  // Query values arrive as ParsedQs, so a repeated ?take=1&take=2 is an array.
  const one = (v: unknown): string =>
    Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' || typeof v === 'number' ? String(v) : '';

  const parsedSkip = parseInt(one(skip), 10);
  const parsedTake = parseInt(one(take), 10);

  // A non-positive take is meaningless rather than merely small, so it falls
  // back to the default instead of being clamped up to a single row.
  return {
    skip: Number.isFinite(parsedSkip) ? Math.max(parsedSkip, 0) : 0,
    take: Number.isFinite(parsedTake) && parsedTake >= 1
      ? Math.min(parsedTake, maxTake)
      : defaultTake,
  };
}