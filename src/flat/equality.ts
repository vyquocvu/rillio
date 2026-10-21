/**
 * Allocation-free shallow equality over own enumerable string-keyed
 * properties. Shared by the compat reconciler's props bailout and the
 * external-store adapter's `shallow` selector equality.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  let count = 0;
  for (const key in a) {
    if (!Object.prototype.hasOwnProperty.call(a, key)) continue;
    count++;
    if (!Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  for (const key in b) {
    if (Object.prototype.hasOwnProperty.call(b, key)) count--;
  }
  return count === 0;
}
