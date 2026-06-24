import type {
  LanguageDescription,
  LanguageSupport,
} from "@codemirror/language";

/**
 * `LanguageLoader` — a verbatim port of
 * `@milkdown/components/code-block/view/loader.ts`. Pure (only `@codemirror/
 * language` types + a `.load()` call), so it lives here rather than being
 * imported from the Vue-coupled `@milkdown/kit/component/code-block` (which
 * doesn't even export it).
 *
 * Builds an alias → `LanguageDescription` map from the registered languages and
 * lazily loads the CodeMirror language pack on demand.
 */
export interface LanguageInfo {
  name: string;
  alias: readonly string[];
}

export class LanguageLoader {
  private readonly map: Record<string, LanguageDescription>;
  private readonly languages: LanguageDescription[];

  constructor(languages: LanguageDescription[]) {
    this.languages = languages;
    this.map = {};

    languages.forEach((language) => {
      language.alias.forEach((alias) => {
        this.map[alias] = language;
      });
    });
  }

  getAll(): LanguageInfo[] {
    return this.languages.map((language): LanguageInfo => {
      return {
        name: language.name,
        alias: language.alias,
      };
    });
  }

  load(languageName: string): Promise<LanguageSupport | undefined> {
    const languageMap = this.map;
    const language = languageMap[languageName.toLowerCase()];

    if (!language) return Promise.resolve(undefined);

    if (language.support) return Promise.resolve(language.support);

    return language.load();
  }
}
