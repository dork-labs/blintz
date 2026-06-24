import type { ChangeEvent, KeyboardEvent } from "react";
import { useId, useRef, useState } from "react";

import { Icon } from "../../shared/Icon";
import { cx } from "../../shared/cx";

interface ImageInputProps {
  src: string;
  readonly: boolean;
  setLink: (link: string) => void;

  imageIcon?: string;
  uploadButton?: string;
  confirmButton?: string;
  uploadPlaceholderText?: string;

  className?: string;

  onUpload: (file: File) => Promise<string>;
  onImageLoadError?: (event: Event) => void | Promise<void>;
}

/**
 * The empty-state upload/link widget shared by the block + inline image views.
 * React port of Crepe's Vue `ImageInput`
 * (`components/__internal__/components/image-input.tsx`): a hidden
 * `<input type=file accept=image/*>` + label, a link `<input>` with
 * Enter-to-confirm, a `.placeholder` overlay, a live preview `<img>`, and a
 * `.confirm` button. Vue `ref`s become `useState`; the Vue `nanoid` becomes
 * React's `useId`; the link input is a `useRef`.
 *
 * Class names mirror Crepe exactly (`.image-edit`, `.link-importer`,
 * `.link-input-area`, `.placeholder`, `.uploader`, `.text`, `.image-preview`,
 * `.confirm`) so the ported `image-block.css` applies unchanged.
 */
export function ImageInput({
  src,
  readonly,
  setLink,
  imageIcon,
  uploadButton,
  confirmButton,
  uploadPlaceholderText,
  className,
  onUpload,
  onImageLoadError,
}: ImageInputProps) {
  const uuid = useId();
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [focusLinkInput, setFocusLinkInput] = useState(false);
  const [currentLink, setCurrentLink] = useState(src ?? "");
  const [hidePlaceholder, setHidePlaceholder] = useState(
    (src?.length ?? 0) !== 0,
  );

  const onEditLink = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHidePlaceholder(value.length !== 0);
    setCurrentLink(value);
  };

  const onKeydown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setLink(linkInputRef.current?.value ?? "");
    }
  };

  const onConfirmLinkInput = () => {
    setLink(linkInputRef.current?.value ?? "");
  };

  const onUploadFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onUpload(file)
      .then((url) => {
        if (!url) return;
        setLink(url);
        setHidePlaceholder(true);
      })
      .catch((err) => {
        console.error("An error occurred while uploading image");
        console.error(err);
      });
  };

  return (
    <div className={cx("image-edit", className)}>
      <Icon className="image-icon" icon={imageIcon} />
      <div className={cx("link-importer", focusLinkInput && "focus")}>
        <input
          ref={linkInputRef}
          draggable="true"
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={readonly}
          className="link-input-area"
          value={currentLink}
          onChange={onEditLink}
          onKeyDown={onKeydown}
          onFocus={() => setFocusLinkInput(true)}
          onBlur={() => setFocusLinkInput(false)}
        />
        {!hidePlaceholder && (
          <div className="placeholder">
            <input
              disabled={readonly}
              className="hidden"
              id={uuid}
              type="file"
              accept="image/*"
              onChange={onUploadFile}
            />
            <label className="uploader" htmlFor={uuid}>
              <Icon icon={uploadButton} />
            </label>
            <span
              className="text"
              onClick={() => linkInputRef.current?.focus()}
            >
              {uploadPlaceholderText}
            </span>
          </div>
        )}
      </div>
      {currentLink && (
        <>
          <div className="image-preview">
            <img
              src={currentLink}
              alt=""
              onError={(e) =>
                Promise.resolve(onImageLoadError?.(e.nativeEvent)).catch(
                  () => {},
                )
              }
            />
          </div>
          <div className="confirm" onClick={() => onConfirmLinkInput()}>
            <Icon icon={confirmButton} />
          </div>
        </>
      )}
    </div>
  );
}
