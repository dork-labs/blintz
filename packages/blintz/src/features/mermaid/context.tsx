import { createContext, useContext } from "react";

import type { MermaidLoader } from ".";

const MermaidContext = createContext<MermaidLoader | undefined>(undefined);

/** Provides the host's mermaid loader to editor chrome (the slash menu). */
export const MermaidProvider = MermaidContext.Provider;

export function useMermaidLoader(): MermaidLoader | undefined {
  return useContext(MermaidContext);
}
