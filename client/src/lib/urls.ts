/**
 * Only http(s) links are rendered as anchors.
 *
 * The server validates these fields too, but a value can predate that rule or
 * arrive from an older client, and a javascript: URL in an href runs in the
 * app's own origin where the tokens sit. rel="noopener" does not help: a
 * javascript: href executes in the current document before any navigation.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null;
}