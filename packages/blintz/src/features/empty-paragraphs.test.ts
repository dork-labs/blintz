import { describe, expect, it } from "vitest";
import {
  commonmark,
  remarkPreserveEmptyLinePlugin,
} from "@milkdown/kit/preset/commonmark";

import { commonmarkWithoutEmptyLinePreservation } from "./empty-paragraphs";

/**
 * Guard for a deliberately fragile integration point.
 *
 * `commonmarkWithoutEmptyLinePreservation` strips Milkdown's
 * `remarkPreserveEmptyLinePlugin` from the commonmark preset by `Array.filter`
 * over object identity (a `$remark` flattens into the preset as its `[options,
 * plugin]` pair). That keeps empty paragraphs from serializing to `<br />`.
 * Milkdown does NOT document the preset as a filterable array, so a future
 * version could restructure it and make the filter silently no-op — which would
 * resurrect the `<br />` round-trip bug with no type error. These assertions
 * fail loudly if that ever happens, on a `@milkdown/kit` bump.
 */
describe("commonmarkWithoutEmptyLinePreservation", () => {
  it("the upstream preset still contains the preserve-empty-line plugin", () => {
    // If this fails, Milkdown changed how the preset is composed — revisit the
    // whole empty-paragraph approach in empty-paragraphs.ts.
    expect(commonmark).toContain(remarkPreserveEmptyLinePlugin.plugin);
    expect(commonmark).toContain(remarkPreserveEmptyLinePlugin.options);
  });

  it("removes exactly the preserve-empty-line plugin's two entries", () => {
    expect(commonmarkWithoutEmptyLinePreservation).not.toContain(
      remarkPreserveEmptyLinePlugin.plugin,
    );
    expect(commonmarkWithoutEmptyLinePreservation).not.toContain(
      remarkPreserveEmptyLinePlugin.options,
    );
    // Nothing else dropped: only the plugin + its options ($remark = 2 entries).
    expect(commonmarkWithoutEmptyLinePreservation).toHaveLength(
      commonmark.length - 2,
    );
  });
});
