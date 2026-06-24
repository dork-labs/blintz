import DOMPurify from "dompurify";
import { useEffect, useRef } from "react";

import type { CodeBlockConfig } from "./config";

/**
 * Preview panel — React port of Crepe's Vue `PreviewPanel`
 * (`code-block/view/components/preview-panel.tsx`). Injects the (sanitized)
 * preview HTML produced by `config.renderPreview`. v1 ships no Mermaid/KaTeX
 * renderer (`renderPreview` defaults to `() => null`), but the plumbing is wired
 * so the panel + the toggle work the moment a renderer is configured.
 *
 * Sanitization uses an SVG/foreignObject-aware DOMPurify config: Mermaid v11+
 * uses `<foreignObject>` for node labels, but foreignObject is an mXSS vector
 * (CVE-2020-26870) outside an SVG context — so we allow it via ADD_TAGS, then a
 * hook strips it if it's NOT inside an SVG. Ported verbatim from upstream.
 */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function createSvgAwareSanitizer() {
  const purify = DOMPurify();

  const config = {
    ADD_TAGS: ["foreignObject"],
    ADD_ATTR: ["xmlns"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  };

  purify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "foreignobject") {
      const parent = (node as Element).parentElement;
      if (!parent || parent.namespaceURI !== SVG_NAMESPACE) {
        node.parentNode?.removeChild(node);
      }
    }
  });

  return (dirty: string | Node) => purify.sanitize(dirty, config);
}

let cachedSanitizer: ReturnType<typeof createSvgAwareSanitizer> | undefined;
function sanitizeSvg(dirty: string | Node): string {
  cachedSanitizer ??= createSvgAwareSanitizer();
  return cachedSanitizer(dirty);
}

interface PreviewPanelProps {
  config: CodeBlockConfig;
  previewOnlyMode: boolean;
  preview: string | HTMLElement | null;
}

export function PreviewPanel({
  config,
  previewOnlyMode,
  preview,
}: PreviewPanelProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (typeof preview === "string" || preview instanceof Element) {
      container.innerHTML = sanitizeSvg(preview);
    }
  }, [preview]);

  if (!preview) return null;

  return (
    <div className="preview-panel">
      {!previewOnlyMode && (
        <>
          <div className="preview-divider" />
          <div className="preview-label">{config.previewLabel}</div>
        </>
      )}
      <div ref={previewRef} className="preview" />
    </div>
  );
}
