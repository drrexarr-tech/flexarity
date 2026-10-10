import { prisma } from './prisma';

/**
 * Families the user actually belongs to.
 *
 * Several routers accepted a `familyId` straight from the request body, which
 * let any authenticated user push content into another tenant's shared feed.
 * shopping.ts already did the right thing inline; this exists so the rest stop
 * duplicating (or forgetting) the check.
 */
export async function familyIdsOf(userId: string): Promise<string[]> {
  const rows = await prisma.familyMember.findMany({
    where: { userId },
    select: { familyId: true },
  });
  return rows.map((r) => r.familyId);
}

/**
 * Resolve a client-supplied familyId, keeping it only when the caller is a
 * member. Anything else becomes null rather than an error, which matches the
 * existing behaviour of clearing the field.
 */
export async function resolveFamilyId(
  userId: string,
  requested: string | null | undefined
): Promise<string | null> {
  if (!requested) return null;
  const familyIds = await familyIdsOf(userId);
  return familyIds.includes(requested) ? requested : null;
}

/** The visibility predicate used by every list and detail query. */
export function visibleTo(userId: string, familyIds: string[]) {
  return {
    OR: [
      { userId },
      { visibility: 'family' as const, familyId: { in: familyIds } },
      { visibility: 'public' as const },
    ],
  };
}