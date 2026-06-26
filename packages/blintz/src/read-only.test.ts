import { describe, it, expect } from "vitest";

import { DEFAULT_EDITABLE, editablePredicate } from "./read-only";

// The full read-only render behavior (no editing chrome, no keyboard input,
// content still renders) is an editor-integration concern that this package's
// node-env runner cannot cover — MarkdownEditor imports CSS and the Milkdown
// stack. These unit tests lock the pure wiring the editor is built from; the
// rendered behavior is verified downstream (the DorkOS canvas) and at REVIEW.
describe("read-only helpers", () => {
  it("defaults to editable so existing consumers are unaffected", () => {
    expect(DEFAULT_EDITABLE).toBe(true);
  });

  it("editablePredicate returns false while read-only", () => {
    const pred = editablePredicate(() => false);
    expect(pred()).toBe(false);
  });

  it("editablePredicate reads the getter live (not captured once)", () => {
    let editable = false;
    const pred = editablePredicate(() => editable);
    expect(pred()).toBe(false);
    // Flipping the source is reflected without rebuilding the predicate — the
    // property that lets `view.editable` track the ref and enables a future
    // reactive toggle.
    editable = true;
    expect(pred()).toBe(true);
  });
});
