import { createContext, useContext } from "react";
import type { Ctx } from "@milkdown/kit/ctx";

/**
 * Bridges Milkdown's `Ctx` to the React tree.
 *
 * The adapter's plugin/node view components render via portals and only receive
 * `{ view }` / `{ node, ... }` from their respective contexts — never the
 * Milkdown `Ctx` they need to call commands or read config slices. We can't pass
 * `ctx` as a prop (adapter components are typed `ComponentType<Record<string,
 * never>>`), so we publish it through React context instead.
 *
 * The value is a stable holder object (`{ current }`) filled inside the
 * `useEditor` factory once the editor is created — so its identity never changes
 * and a view reading `holder.current` always sees the live ctx (views only
 * mount *after* the editor exists). Typed as a bare `{ current }` rather than a
 * `RefObject`/`MutableRefObject` so it's identical across React 18 and 19.
 */
export type CtxHolder = { current: Ctx | null };

const EditorCtxContext = createContext<CtxHolder | null>(null);

export const EditorCtxProvider = EditorCtxContext.Provider;

/** Read the live Milkdown `Ctx` from inside an adapter view component. */
export function useEditorCtx(): Ctx {
  const holder = useContext(EditorCtxContext);
  if (!holder) {
    throw new Error("useEditorCtx must be used within <MarkdownEditor>");
  }
  if (!holder.current) {
    throw new Error("Milkdown ctx is not ready yet");
  }
  return holder.current;
}
