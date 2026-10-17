import type { Editor } from "@milkdown/kit/core";

import { remarkBlockDirectivesPlugin } from "./remark";
import { embedContainerSchema, embedSchema } from "./schema";

/** The embed grammar alone (remark plugin + both node schemas), no views. */
export function embedGrammarFeature(editor: Editor): void {
  editor
    .use(remarkBlockDirectivesPlugin)
    .use(embedSchema)
    .use(embedContainerSchema);
}
