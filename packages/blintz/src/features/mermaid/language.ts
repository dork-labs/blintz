import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";

/**
 * A "Mermaid" entry for the code-block language picker. CodeMirror has no
 * mermaid grammar, so the source is edited as plain text; the point is that
 * the picker can turn any code block into a diagram.
 */
export const mermaidLanguage = LanguageDescription.of({
  name: "Mermaid",
  alias: ["mermaid", "mmd"],
  extensions: ["mmd", "mermaid"],
  load: async () =>
    new LanguageSupport(
      StreamLanguage.define({
        name: "mermaid",
        token(stream) {
          stream.skipToEnd();
          return null;
        },
      }),
    ),
});

/** What the slash menu's Diagram item starts with. */
export const STARTER_DIAGRAM = "flowchart LR\n  Idea --> Draft --> Review --> Done";
