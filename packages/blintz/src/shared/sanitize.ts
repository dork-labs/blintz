import DOMPurify from "dompurify";

/**
 * Sanitize an HTML/SVG string before it is injected via `dangerouslySetInnerHTML`.
 *
 * Crepe's icons are raw inline-SVG strings and the link tooltip echoes
 * user-provided hrefs; both are sanitized with DOMPurify before hitting the DOM.
 * Centralized here so every injection point uses the same configuration.
 */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html);
}
