import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "../../shared/Icon";
import type { ImageBlockConfig } from "./config";
import { IMAGE_DATA_TYPE } from "./schema";

interface ImageViewerProps {
  /** Already-resolved display src (after `proxyDomURL`). */
  src: string;
  caption: string;
  ratio: number;
  readonly: boolean;
  config: ImageBlockConfig;
  /** Persist a single attr (DOMPurify-sanitizes `src` upstream; guards on
   * `view.editable`). */
  setAttr: (attr: "caption" | "ratio", value: string | number) => void;
}

/**
 * The non-empty block image: the image plus its hover caption toggle and the
 * bottom drag-to-resize handle. React port of Crepe's Vue `ImageViewer`
 * (`image-block/view/components/image-viewer.tsx`) — the imperative sizing,
 * window-pointer resize, and debounced caption logic transplanted into
 * refs/handlers/effects.
 *
 * The live `<img>` is held in a `useRef` (not state) so the drag mutates
 * `style.height` / `dataset` directly without re-render thrash, exactly like
 * the Vue template ref. Window `pointermove`/`pointerup` listeners are added on
 * pointer-down and removed on release (and on unmount), and the caption debounce
 * timer is cleared on unmount.
 */
export function ImageViewer({
  src,
  caption,
  ratio,
  readonly,
  config,
  setAttr,
}: ImageViewerProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const timerRef = useRef<number>(0);
  const [showCaption, setShowCaption] = useState(Boolean(caption?.length));

  const onImageLoad = () => {
    const image = imageRef.current;
    if (!image) return;
    const host = image.closest(".milkdown-image-block");
    if (!host) return;

    let maxWidth = host.getBoundingClientRect().width;
    if (!maxWidth) return;

    if (config.maxWidth && config.maxWidth < maxWidth) maxWidth = config.maxWidth;

    const height = image.naturalHeight;
    const width = image.naturalWidth;
    let transformedHeight =
      width < maxWidth ? height : maxWidth * (height / width);

    if (config.maxHeight && transformedHeight > config.maxHeight)
      transformedHeight = config.maxHeight;

    const h = (transformedHeight * (ratio ?? 1)).toFixed(2);
    image.dataset.origin = transformedHeight.toFixed(2);
    image.dataset.height = h;
    image.style.height = `${h}px`;

    if (config.maxWidth) image.style.maxWidth = `${config.maxWidth}px`;
  };

  const onToggleCaption = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readonly) return;
    setShowCaption((prev) => !prev);
  };

  const onInputCaption = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      setAttr("caption", value);
    }, 1000);
  };

  const onBlurCaption = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = 0;
    }
    setAttr("caption", value);
  };

  const onResizeHandlePointerMove = useCallback((e: PointerEvent) => {
    e.preventDefault();
    const image = imageRef.current;
    if (!image) return;
    const top = image.getBoundingClientRect().top;
    let height = e.clientY - top;
    if (height < 100) height = 100;
    if (config.maxHeight && height > config.maxHeight) height = config.maxHeight;
    const h = Number(height).toFixed(2);
    image.dataset.height = h;
    image.style.height = `${h}px`;
  }, [config.maxHeight]);

  const onResizeHandlePointerUp = useCallback(() => {
    window.removeEventListener("pointermove", onResizeHandlePointerMove);
    window.removeEventListener("pointerup", onResizeHandlePointerUp);

    const image = imageRef.current;
    if (!image) return;

    const originHeight = Number(image.dataset.origin);
    const currentHeight = Number(image.dataset.height);
    const nextRatio = Number.parseFloat(
      Number(currentHeight / originHeight).toFixed(2),
    );
    if (Number.isNaN(nextRatio)) return;

    setAttr("ratio", nextRatio);
  }, [onResizeHandlePointerMove, setAttr]);

  const onResizeHandlePointerDown = (e: ReactPointerEvent) => {
    if (readonly) return;
    e.preventDefault();
    e.stopPropagation();
    window.addEventListener("pointermove", onResizeHandlePointerMove);
    window.addEventListener("pointerup", onResizeHandlePointerUp);
  };

  // Cleanup: drop any dangling window listeners + the caption debounce timer.
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onResizeHandlePointerMove);
      window.removeEventListener("pointerup", onResizeHandlePointerUp);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [onResizeHandlePointerMove, onResizeHandlePointerUp]);

  return (
    <>
      <div className="image-wrapper">
        <div className="operation">
          <div className="operation-item" onPointerDown={onToggleCaption}>
            <Icon icon={config.captionIcon} />
          </div>
        </div>
        <img
          ref={imageRef}
          data-type={IMAGE_DATA_TYPE}
          onLoad={onImageLoad}
          src={src}
          alt={caption}
          onError={(e) =>
            Promise.resolve(config.onImageLoadError?.(e.nativeEvent)).catch(
              () => {},
            )
          }
        />
        <div
          className="image-resize-handle"
          onPointerDown={onResizeHandlePointerDown}
        />
      </div>
      {showCaption && (
        <input
          draggable="true"
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="caption-input"
          placeholder={config?.captionPlaceholderText}
          onChange={onInputCaption}
          onBlur={onBlurCaption}
          defaultValue={caption}
        />
      )}
    </>
  );
}
