import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** Token-based code paint follows the host palette without rebuilding CodeMirror. */
export const codeTheme = [
  EditorView.theme({
    "&": {
      color: "var(--crepe-color-on-surface)",
      backgroundColor: "var(--crepe-color-surface)",
    },
    ".cm-content": {
      fontFamily: "var(--crepe-font-code)",
      caretColor: "var(--crepe-color-on-surface)",
    },
    ".cm-scroller": {
      fontFamily: "var(--crepe-font-code)",
      lineHeight: "1.65",
      overflow: "auto",
    },
    ".cm-gutters": {
      color: "var(--crepe-color-on-surface-variant)",
      backgroundColor: "var(--crepe-color-surface)",
      border: "none",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "var(--crepe-color-hover)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "var(--crepe-color-selected)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--crepe-color-on-surface)",
    },
    ".cm-tooltip": {
      color: "var(--crepe-color-on-surface)",
      backgroundColor: "var(--crepe-color-surface-low)",
      borderColor: "var(--crepe-color-outline)",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--crepe-color-secondary)",
      outline: "1px solid var(--crepe-color-primary)",
    },
  }),
  syntaxHighlighting(
    HighlightStyle.define([
      {
        tag: [tags.keyword, tags.modifier],
        color: "var(--blintz-syntax-keyword)",
      },
      { tag: [tags.string, tags.regexp], color: "var(--blintz-syntax-string)" },
      {
        tag: [tags.number, tags.bool, tags.null],
        color: "var(--blintz-syntax-number)",
      },
      {
        tag: tags.comment,
        color: "var(--blintz-syntax-comment)",
        fontStyle: "italic",
      },
      {
        tag: [
          tags.function(tags.variableName),
          tags.function(tags.propertyName),
        ],
        color: "var(--blintz-syntax-function)",
      },
      {
        tag: [tags.typeName, tags.className, tags.tagName, tags.attributeName],
        color: "var(--blintz-syntax-type)",
      },
      {
        tag: [tags.operator, tags.punctuation],
        color: "var(--blintz-syntax-operator)",
      },
    ]),
  ),
];
