/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ImageViewer } from "./ImageViewer";
import { defaultImageBlockConfig } from "./config";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("image reading mode", () => {
  it("turns editing controls and the caption input into static content live", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const setAttr = vi.fn();
    const render = async (readonly: boolean) => {
      await act(async () =>
        root.render(
          <ImageViewer
            src="/example.png"
            caption="A clear morning"
            ratio={1}
            readonly={readonly}
            config={defaultImageBlockConfig}
            setAttr={setAttr}
          />,
        ),
      );
    };
    try {
      await render(false);
      expect(
        container.querySelector('button[aria-label="Toggle image caption"]'),
      ).not.toBeNull();
      expect(
        container.querySelector('input[aria-label="Image caption"]'),
      ).not.toBeNull();
      await render(true);
      expect(
        container.querySelector("button, input, .image-resize-handle"),
      ).toBeNull();
      expect(container.querySelector(".caption-input")?.textContent).toBe(
        "A clear morning",
      );
      expect(container.querySelector("img")?.alt).toBe("A clear morning");
      expect(setAttr).not.toHaveBeenCalled();
      await render(false);
      expect(
        container.querySelector('input[aria-label="Image caption"]'),
      ).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });
});
