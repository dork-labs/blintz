import type { WikiLinkOptions } from "blintz";

/** A tiny page directory for the playground's wiki links. */
const PAGES: Record<string, string> = {
  Roadmap: "Plans for the next two quarters",
  "Team Charter": "How we work together",
  "Meeting Notes": "Weekly sync notes",
  "Reading List": "Books and papers",
};

const slug = (title: string) => title.toLowerCase().replace(/\s+/g, "-");

export const SAMPLE_WIKI_LINKS: WikiLinkOptions = {
  resolve: (link) =>
    link.target in PAGES
      ? {
          exists: true,
          href: `#${slug(link.target)}${link.heading ? `/${slug(link.heading)}` : ""}`,
          title: PAGES[link.target],
        }
      : { exists: false },
  search: (query) =>
    Object.entries(PAGES)
      .filter(([title]) => title.toLowerCase().includes(query.toLowerCase()))
      .map(([target, description]) => ({ target, description })),
};
