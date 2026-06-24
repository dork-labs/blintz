import { useNodeViewContext } from "@prosemirror-adapter/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../../shared/Icon";
import { cx } from "../../shared/cx";
import { useEditorCtx } from "../../shared/editor-ctx";
import { CopyButton } from "./CopyButton";
import { LanguagePicker } from "./LanguagePicker";
import { PreviewPanel } from "./PreviewPanel";
import { CodeMirrorController } from "./controller";
import { codeBlockConfig } from "./config";
import { LanguageLoader } from "./loader";

/**
 * React node view for `code_block` — replaces ProseMirror's default code_block
 * with an embedded CodeMirror 6 editor + Crepe's "tools" bar. The host element
 * is `<div class="milkdown-code-block">` (created by the factory's `as`); this
 * component renders the chrome and owns the `CodeMirrorController` (the ported
 * PM↔CM sync engine). There is NO PM `contentDOM`/`contentRef` — all code text
 * lives inside CodeMirror and flows back to PM via the controller.
 *
 * CM is kept as an imperative ref (never a controlled component): React renders
 * the chrome, the controller dispatches CM changes outside render. On every
 * re-render (PM hands us a fresh `node`), we call `controller.update(node)` to
 * apply minimal PM→CM diffs + reconfigure language/read-only.
 */
export function CodeBlockView() {
  const { node, view, getPos, setAttrs, selected } = useNodeViewContext();
  const ctx = useEditorCtx();
  const config = ctx.get(codeBlockConfig.key);

  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CodeMirrorController | null>(null);

  // The language loader is derived once from the configured language list.
  const loader = useMemo(
    () => new LanguageLoader(config.languages),
    [config.languages],
  );

  const language: string = node.attrs.language ?? "";
  const text = node.textContent;

  // Preview: hidden in v1 (renderPreview defaults to null), but the plumbing is
  // live so the toggle + panel work the moment a renderer is configured.
  const [preview, setPreview] = useState<string | HTMLElement | null>(null);
  const [previewOnlyMode, setPreviewOnlyMode] = useState<boolean>(
    config.previewOnlyByDefault ?? !view.editable,
  );

  // Create + mount CodeMirror inside the effect (NOT during render) so the
  // lifecycle is symmetric under React 19 StrictMode's mount→cleanup→mount
  // double-invoke: the cleanup destroys CM and nulls the ref, and this effect
  // re-creates both on the second run. (Creating the controller during render and
  // nulling the ref in cleanup left the StrictMode re-run with a null ref and no
  // CM — the chrome rendered but the editor body never appeared.) The update
  // effect below runs after this one on each commit, so it always sees the
  // controller. (Simplification vs. upstream's lazy IntersectionObserver mount —
  // see controller.ts; `setSelection`/`selectNode` still force-init CM.)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new CodeMirrorController(
      node,
      view,
      getPos,
      loader,
      config,
    );
    controllerRef.current = controller;
    const cm = controller.init(host);
    // If CM was force-initialized earlier (detached host), re-parent it here.
    if (cm.dom.parentElement !== host) host.appendChild(cm.dom);
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
    // Mount once; node/view changes are pushed imperatively in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the controller's live handles fresh, then push the PM→CM diff. Runs on
  // every render (a new `node`/`getPos` from PM), mirroring upstream `update()`.
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.view = view;
    controller.getPos = getPos;
    controller.config = config;
    controller.loader = loader;
    controller.update(node);
  });

  // Reflect PM's node selection onto the outer `.milkdown-code-block` host (the
  // factory's `as` element, our render root's parent) so `.selected`'s outline
  // applies — upstream toggled this class on `this.dom`.
  useEffect(() => {
    const outer = hostRef.current?.parentElement;
    if (!outer) return;
    outer.classList.toggle("selected", selected);
  }, [selected]);

  // Recompute the preview whenever the text/language changes (Vue's `watch`).
  useEffect(() => {
    const result = config.renderPreview(language, text, (value) =>
      setPreview(value),
    );
    if (result) {
      setPreview(result);
      return;
    }
    // Async render (returned undefined) with nothing applied yet → loading state.
    if (result === undefined) {
      setPreview((prev) => prev || config.previewLoading);
      return;
    }
    // result === null → no preview.
    setPreview(null);
    // config is stable per editor; depend on the inputs that actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, text]);

  const setLanguage = (lang: string) => {
    // Write the node attr; the controller's update() reacts to load the CM pack.
    setAttrs({ language: lang });
  };

  return (
    <>
      <div className="tools" contentEditable={false}>
        <LanguagePicker
          language={language}
          config={config}
          setLanguage={setLanguage}
          getAllLanguages={() => loader.getAll()}
          getReadOnly={() => !view.editable}
        />

        <div className="tools-button-group">
          <CopyButton
            copyIcon={config.copyIcon}
            copyText={config.copyText}
            onCopy={config.onCopy ?? (() => {})}
            text={text}
          />

          {preview ? (
            <button
              type="button"
              className="preview-toggle-button"
              onClick={() => setPreviewOnlyMode((prev) => !prev)}
            >
              <Icon icon={config.previewToggleButton(previewOnlyMode)} />
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={hostRef}
        className={cx("codemirror-host", preview && previewOnlyMode && "hidden")}
      />

      <PreviewPanel
        config={config}
        previewOnlyMode={previewOnlyMode}
        preview={preview}
      />
    </>
  );
}
