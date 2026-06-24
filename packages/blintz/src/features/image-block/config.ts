import { $ctx } from "@milkdown/kit/utils";

import { captionIcon, confirmIcon, imageIcon } from "../../icons";

/**
 * The image config `$ctx` slices, re-implemented locally (port of
 * `@milkdown/components/image-block/config.ts` + `image-inline/config.ts`),
 * with the defaults pre-merged with Crepe's feature wrapper
 * (`crepe/src/feature/image-block/index.ts`): the icons default to the local
 * SVG strings and the labels to Crepe's copy. Owned here so we never import the
 * Vue-coupled `@milkdown/kit/component/image-{block,inline}` packages.
 *
 * The React node views read these via the editor `Ctx`
 * (`ctx.get(imageBlockConfig.key)` / `ctx.get(inlineImageConfig.key)`).
 */

export interface ImageBlockConfig {
  imageIcon: string | undefined;
  captionIcon: string | undefined;
  uploadButton: string | undefined;
  confirmButton: string | undefined;
  uploadPlaceholderText: string;
  captionPlaceholderText: string;
  onUpload: (file: File) => Promise<string>;
  proxyDomURL?: (url: string) => Promise<string> | string;
  onImageLoadError?: (event: Event) => void | Promise<void>;
  maxWidth?: number;
  maxHeight?: number;
}

export const defaultImageBlockConfig: ImageBlockConfig = {
  imageIcon,
  captionIcon,
  uploadButton: "Upload file",
  confirmButton: confirmIcon,
  uploadPlaceholderText: "or paste link",
  captionPlaceholderText: "Write Image Caption",
  onUpload: (file) => Promise.resolve(URL.createObjectURL(file)),
};

export const imageBlockConfig = $ctx(
  defaultImageBlockConfig,
  "imageBlockConfigCtx",
);

export interface InlineImageConfig {
  imageIcon: string | undefined;
  uploadButton: string | undefined;
  confirmButton: string | undefined;
  uploadPlaceholderText: string;
  onUpload: (file: File) => Promise<string>;
  proxyDomURL?: (url: string) => Promise<string> | string;
}

export const defaultInlineImageConfig: InlineImageConfig = {
  imageIcon,
  uploadButton: "Upload",
  confirmButton: confirmIcon,
  uploadPlaceholderText: "or paste link",
  onUpload: (file) => Promise.resolve(URL.createObjectURL(file)),
};

export const inlineImageConfig = $ctx(
  defaultInlineImageConfig,
  "inlineImageConfigCtx",
);
