import { useNodeViewContext } from "@prosemirror-adapter/react";
import { useEffect, useState } from "react";

import { sanitize } from "../../shared/sanitize";
import { useEditorCtx } from "../../shared/editor-ctx";
import { ImageInput } from "./ImageInput";
import { ImageViewer } from "./ImageViewer";
import { imageBlockConfig } from "./config";

/**
 * React node view for the block-level `image-block` node. Replaces Crepe's Vue
 * `MilkdownImageBlock` + its `$view`/`createApp` constructor
 * (`image-block/view/index.ts`).
 *
 * The factory hosts this in a `<div class="milkdown-image-block">` (the `as`
 * option in `index.ts`). `useNodeViewContext` supplies `{ node, view, getPos,
 * setAttrs, selected }` — the direct analogues of the Vue refs + `setAttr`.
 * React re-renders on `update` automatically, so there's no manual
 * `bindAttrs`/`watchEffect`; selection drives the `.selected` class.
 *
 * Empty `src` → the `<ImageInput>` upload widget; non-empty → the `<ImageViewer>`
 * (caption toggle + drag-resize).
 */
export function ImageBlockView() {
  const { node, view, setAttrs, selected } = useNodeViewContext();
  const ctx = useEditorCtx();
  const config = ctx.get(imageBlockConfig.key);

  const { src, caption, ratio } = node.attrs as {
    src: string;
    caption: string;
    ratio: number;
  };
  const readonly = !view.editable;

  // `proxyDomURL` may return a string OR a Promise — resolve it in an effect
  // keyed on `src` (mirrors the Vue `bindAttrs`). Falls back to the raw src.
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

  const setAttr = (attr: "src" | "caption" | "ratio", value: unknown) => {
    if (!view.editable) return;
    setAttrs({
      [attr]: attr === "src" ? sanitize(value as string) : value,
    });
  };

  if (!src?.length) {
    return (
      <ImageInput
        src={src}
        readonly={readonly}
        setLink={(link) => setAttr("src", link)}
        imageIcon={config.imageIcon}
        uploadButton={config.uploadButton}
        confirmButton={config.confirmButton}
        uploadPlaceholderText={config.uploadPlaceholderText}
        onUpload={config.onUpload}
        onImageLoadError={config.onImageLoadError}
        className={selected ? "selected" : undefined}
      />
    );
  }

  return (
    <ImageViewer
      src={displaySrc}
      caption={caption}
      ratio={ratio}
      readonly={readonly}
      config={config}
      setAttr={setAttr}
    />
  );
}
