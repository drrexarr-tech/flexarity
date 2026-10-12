import { useCallback, useRef } from 'react';

/**
 * Runs an action at most once at a time per key.
 *
 * With the delete confirmation gone, this is the only thing standing between a
 * double tap and two DELETEs. The second request comes back 404 and the user is
 * shown an error for an action that worked, which is worse than the
 * confirmation it replaces.
 *
 * Keyed rather than a single boolean so removing one row does not block
 * removing the next while the first is still in flight.
 */
export function useSingleFlight() {
  const inFlight = useRef<Set<string>>(new Set());

  return useCallback(async (key: string, fn: () => Promise<unknown>) => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      await fn();
    } finally {
      inFlight.current.delete(key);
    }
  }, []);
}