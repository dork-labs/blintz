/**
 * Tiny classname joiner — the slice of `clsx` these components actually use.
 * Inlined to keep the package's dependency surface minimal.
 */
export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
