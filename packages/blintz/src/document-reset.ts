/**
 * Transaction meta set when the host replaces the whole document (a new
 * `value` that isn't the editor's own edit). Plugins that track positions
 * use it to tell "a different document arrived" from a user replacing
 * everything (select-all and type), which looks the same step for step.
 * The reset is kept out of undo history.
 */
export const DOCUMENT_RESET_META = "blintz:document-reset";
