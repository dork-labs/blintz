/**
 * Read-only mode helpers — pure and dependency-free so the editor's editability
 * contract is unit-testable in the node-env test runner. The editor itself
 * (`MarkdownEditor` / `useBlintzEditor`) imports CSS and the Milkdown stack, so
 * it cannot be exercised without a DOM; these helpers carry the small piece of
 * read-only logic that can.
 */

/** Editability when the `editable` prop is omitted. */
export const DEFAULT_EDITABLE = true;

/**
 * Wrap an editability getter as ProseMirror's `editable` view option. The
 * returned predicate is read live on every state update, so `view.editable`
 * always reflects the current value — which is what the feature views
 * (toolbar, placeholder, table, list, image, code, latex) gate their editing
 * affordances on. Keeping it a live getter (not a captured boolean) is also
 * what would let a future reactive toggle flip editability without rebuilding
 * the editor.
 */
export function editablePredicate(isEditable: () => boolean): () => boolean {
  return () => isEditable();
}
