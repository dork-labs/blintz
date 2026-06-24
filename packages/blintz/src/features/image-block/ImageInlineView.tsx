import { useNodeViewContext } from "@prosemirror-adapter/react";
import { useEffect, useState } from "react";

import { sanitize } from "../../shared/sanitize";
import { useEditorCtx } from "../../shared/editor-ctx";
import { ImageInput } from "./ImageInput";
import { inlineImageConfig } from "./config";

/**
 * React node view for the inline commonmark `image` node ('image'). Replaces
 * Crepe's Vue `MilkdownImageInline` + its `$view` constructor
 * (`image-inline/view.ts`). NOTE: this targets the commonmark `imageSchema`
 * node, NOT the block `image-block` schema — they're two different nodes.
 *
 * Hosted in a `<span class="milkdown-image-inline">` (the `as` option).
 * Empty `src` → the small `<ImageInput className="empty-image-inline">` upload
 * widget; non-empty → a plain inline `<img class="image-inline">`.
 */
export function ImageInlineView() {
  const { node, view, setAttrs } = useNodeViewContext();
  const ctx = useEditorCtx();
  const config = ctx.get(inlineImageConfig.key);

  const { src, alt, title } = node.attrs as {
    src: string;
    alt: string;
    title: string;
  };
  const readonly = !view.editable;

  // `proxyDomURL` may return string OR Promise — resolve in an effect keyed on src.
  const [displaySrc, setDisplaySrc] = useState(src);
  useEffect(() => {
    const proxy = config.proxyDomURL;
    if (!proxy) {
      setDisplaySrc(src);
      return;
    }
    const proxied = proxy(src);
    if (typeof proxied === "string") {
      setDisplaySrc(proxied);
      return;
    }
    let cancelled = false;
    proxied
      .then((url) => {
        if (!cancelled) setDisplaySrc(url);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [src, config.proxyDomURL]);

  const setLink = (link: string) => {
    if (!view.editable) return;
    setAttrs({ src: sanitize(link) });
  };

  if (!src?.length) {
    return (
      <ImageInput
        src={src}
        readonly={readonly}
        setLink={setLink}
        imageIcon={config.imageIcon}
        uploadButton={config.uploadButton}
        confirmButton={config.confirmButton}
        uploadPlaceholderText={config.uploadPlaceholderText}
        onUpload={config.onUpload}
        className="empty-image-inline"
      />
    );
  }

  return (
    <img className="image-inline" src={displaySrc} alt={alt} title={title} />
  );
}
