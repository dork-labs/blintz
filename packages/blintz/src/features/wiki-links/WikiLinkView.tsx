import { useMemo, useSyncExternalStore, type MouseEvent } from "react";
import { useNodeViewContext } from "@prosemirror-adapter/react";

import { cx } from "../../shared/cx";
import { useEditorEditable } from "../../shared/editor-ctx";
import { useWikiLinks } from "./options";
import { wikiLinkFromAttrs, wikiLinkText } from "./schema";

/**
 * Inline view for a wiki link. Shows the label (or target), and asks the host
 * where it points: a resolved link gets its `href`; a missing one is styled
 * as missing; while resolving it renders as plain link text.
 *
 * Clicking follows the usual editor rule: in a read-only document a click
 * opens the link; while editing, a plain click only selects it and
 * Cmd/Ctrl-click opens it.
 */
export function WikiLinkView() {
  const { node, view, selected } = useNodeViewContext();
  const link = useMemo(() => wikiLinkFromAttrs(node.attrs), [node.attrs]);
  const editable = useEditorEditable(view);
  const { options, resolver } = useWikiLinks();
  const entry = useSyncExternalStore(
    resolver.subscribe,
    () => resolver.read(link),
    () => undefined,
  );
  const resolution = entry?.state === "resolved" ? entry.resolution : undefined;
  const href = safeHref(resolution?.href);
  const state = !resolver.enabled
    ? "unresolved"
    : entry?.state === "pending"
      ? "pending"
      : resolution?.exists
        ? "resolved"
        : "missing";

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const wantsOpen = !editable || event.metaKey || event.ctrlKey;
    if (!wantsOpen) {
      event.preventDefault();
      return;
    }
    if (options.onOpen) {
      event.preventDefault();
      options.onOpen(link, resolution);
      return;
    }
    if (!href) event.preventDefault();
  };

  return (
    <a
      className={cx("blintz-wiki-link", link.embed && "is-embed", selected && "is-selected")}
      data-state={state}
      href={href}
      title={resolution?.title ?? (state === "missing" ? `${link.target} (missing)` : undefined)}
      onClick={onClick}
      draggable={false}
    >
      {wikiLinkText(link)}
    </a>
  );
}

/**
 * Only navigable, script-free destinations become an `href`: http(s),
 * mailto, and relative URLs (`/docs/a`, `#h`, `?q`, `page`). A host that
 * builds hrefs from what authors typed can't be tricked into `javascript:`.
 */
export function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  // Strip what browsers ignore before the scheme (controls and whitespace).
  const trimmed = href.replace(/^[\u0000-\u0020]+/, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed.replace(/[\t\n\r]/g, ""));
  if (!scheme) return href;
  return ["http", "https", "mailto"].includes(scheme[1]!.toLowerCase()) ? href : undefined;
}
