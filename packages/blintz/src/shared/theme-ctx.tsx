import { createContext, useContext } from "react";

/** The editor's effective palette, for views whose output depends on it. */
export type ResolvedTheme = "light" | "dark";

const ThemeContext = createContext<ResolvedTheme>("light");

export const BlintzThemeProvider = ThemeContext.Provider;

export function useBlintzTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}
