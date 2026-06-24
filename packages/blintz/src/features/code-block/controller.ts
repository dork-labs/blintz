import type { Line, SelectionRange } from "@codemirror/state";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView as CodeMirror,
  type KeyBinding,
  type ViewUpdate,
  keymap as cmKeymap,
  drawSelection,
} from "@codemirror/view";
import { exitCode } from "@milkdown/kit/prose/commands";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { CodeBlockConfig } from "./config";
import type { LanguageLoader } from "./loader";

/**
 * Per-`EditorView` registry of live code-block controllers, so the node-view
 * factory's lifecycle overrides (`setSelection`/`selectNode`) — which the React
 * adapter exposes as plain closures with NO per-instance handle — can route to
 * the right controller. We can't pass the controller through the options object
 * (it's shared across every instance), so each controller self-registers here on
 * create and the override finds the one whose `getPos()` range contains the
 * target position (exactly how PM itself locates a node view).
 */
const registry = new WeakMap<EditorView, Set<CodeMirrorController>>();

function register(view: EditorView, ctrl: CodeMirrorController): void {
  let set = registry.get(view);
  if (!set) {
    set = new Set();
    registry.set(view, set);
  }
  set.add(ctrl);
}

function unregister(view: EditorView, ctrl: CodeMirrorController): void {
  registry.get(view)?.delete(ctrl);
}

/** Find the controller whose node currently spans `pos` (inclusive of its
 * inner text range). Used by the factory's `setSelection`/`selectNode`. */
export function findControllerAt(
  view: EditorView,
  pos: number,
): CodeMirrorController | undefined {
  const set = registry.get(view);
  if (!set) return undefined;
  for (const ctrl of set) {
    const start = ctrl.getPos();
    if (start == null) continue;
    const end = start + ctrl.node.nodeSize;
    // Inner text lives in (start, end); accept the boundary too.
    if (pos >= start && pos <= end) return ctrl;
  }
  return undefined;
}

/**
 * `CodeMirrorController` — the framework-agnostic PM↔CM sync engine, transplanted
 * from `@milkdown/components/code-block/view/node-view.ts`. The Vue chrome glue
 * (`createApp`, `ref`, `watchEffect`, the `selected/text/language` refs) is
 * stripped out: the React `CodeBlockView` owns the chrome and drives this
 * controller imperatively (CM stays an imperative ref, never a controlled
 * component). The two correctness guards are preserved verbatim:
 *   - `forwardUpdate` is gated by `updating` + `cm.hasFocus` (CM→PM only when the
 *     user is typing in CM, never echoing a programmatic change), and
 *   - `update()` uses `computeChange` minimal diffs (PM→CM) so the cursor never
 *     jumps and we don't loop.
 *
 * Simplification vs. upstream: CM mounts **eagerly** (the React component creates
 * it on mount, destroys on unmount) rather than lazily via IntersectionObserver.
 * `forceInit()` is still provided so `setSelection`/`selectNode` can focus CM
 * even if it hasn't been created yet.
 */
export class CodeMirrorController {
  cm: CodeMirror | null = null;

  private updating = false;
  private languageName = "";
  private readonly languageConf = new Compartment();
  private readonly readOnlyConf = new Compartment();

  /** Notifies the React layer that `cm.state.doc` changed (drives the preview +
   * copy text). Set by the component. */
  onTextChange: ((text: string) => void) | null = null;

  node: Node;
  view: EditorView;
  getPos: () => number | undefined;
  loader: LanguageLoader;
  config: CodeBlockConfig;

  constructor(
    node: Node,
    view: EditorView,
    getPos: () => number | undefined,
    loader: LanguageLoader,
    config: CodeBlockConfig,
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.loader = loader;
    this.config = config;
    register(view, this);
  }

  /** Create the CodeMirror instance inside `host`. Idempotent. */
  init(host: HTMLElement): CodeMirror {
    if (this.cm) return this.cm;

    this.cm = new CodeMirror({
      doc: this.node.textContent,
      // Pass the editor root so CM is correct under a shadow DOM / iframe.
      root: this.view.root,
      extensions: [
        this.readOnlyConf.of(EditorState.readOnly.of(!this.view.editable)),
        drawSelection(),
        cmKeymap.of(this.codeMirrorKeymap()),
        this.languageConf.of([]),
        EditorState.changeFilter.of(() => this.view.editable),
        ...this.config.extensions,
        CodeMirror.updateListener.of(this.forwardUpdate),
      ],
    });

    host.appendChild(this.cm.dom);
    this.updateLanguage();
    return this.cm;
  }

  /** Force-create CM into a detached host if it was never mounted, so a
   * `setSelection`/`selectNode` arriving before mount can still focus it. The
   * component re-parents `cm.dom` into its host on its next effect. */
  private forceInit(): CodeMirror {
    if (this.cm) return this.cm;
    return this.init(document.createElement("div"));
  }

  /** CM→PM: mirror CM edits back into the ProseMirror document. Guarded so it
   * only fires for user typing in CM (`cm.hasFocus`) and never for a change we
   * dispatched ourselves (`updating`). Verbatim from upstream. */
  private forwardUpdate = (update: ViewUpdate) => {
    if (!this.cm) return;
    if (this.updating || !this.cm.hasFocus) return;
    let offset = (this.getPos() ?? 0) + 1;
    const { main } = update.state.selection;
    const selFrom = offset + main.from;
    const selTo = offset + main.to;
    const pmSel = this.view.state.selection;
    if (update.docChanged || pmSel.from !== selFrom || pmSel.to !== selTo) {
      const tr = this.view.state.tr;
      update.changes.iterChanges((fromA, toA, _fromB, toB, text) => {
        if (text.length)
          tr.replaceWith(
            offset + fromA,
            offset + toA,
            this.view.state.schema.text(text.toString()),
          );
        else tr.delete(offset + fromA, offset + toA);
        offset += toB - _fromB - (toA - fromA);
      });
      tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo));
      this.view.dispatch(tr);
    }
  };

  /** Load + reconfigure the CM language pack to match `node.attrs.language`. */
  private updateLanguage() {
    if (!this.cm) return;
    const languageName: string = this.node.attrs.language ?? "";

    if (languageName === this.languageName) return;

    this.loader
      .load(languageName)
      .then((lang) => {
        if (!this.cm) return;
        if (lang) {
          this.cm.dispatch({
            effects: this.languageConf.reconfigure(lang),
          });
        } else {
          this.cm.dispatch({
            effects: this.languageConf.reconfigure([]),
          });
        }
        this.languageName = languageName;
      })
      .catch(console.error);
  }

  private codeMirrorKeymap = (): KeyBinding[] => {
    const view = this.view;
    return [
      { key: "ArrowUp", run: () => this.maybeEscape("line", -1) },
      { key: "ArrowLeft", run: () => this.maybeEscape("char", -1) },
      { key: "ArrowDown", run: () => this.maybeEscape("line", 1) },
      { key: "ArrowRight", run: () => this.maybeEscape("char", 1) },
      {
        key: "Mod-Enter",
        run: () => {
          if (!exitCode(view.state, view.dispatch)) return false;
          view.focus();
          return true;
        },
      },
      { key: "Mod-z", run: () => undo(view.state, view.dispatch) },
      { key: "Shift-Mod-z", run: () => redo(view.state, view.dispatch) },
      { key: "Mod-y", run: () => redo(view.state, view.dispatch) },
      {
        key: "Backspace",
        run: () => {
          if (!this.cm) return false;
          const ranges = this.cm.state.selection.ranges;

          if (ranges.length > 1) return false;

          const selection = ranges[0];

          if (selection && (!selection.empty || selection.anchor > 0))
            return false;

          if (this.cm.state.doc.lines >= 2) return false;

          const state = this.view.state;
          const pos = this.getPos() ?? 0;
          const tr = state.tr.replaceWith(
            pos,
            pos + this.node.nodeSize,
            state.schema.nodes.paragraph!.createChecked({}, this.node.content),
          );

          tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));

          this.view.dispatch(tr);
          this.view.focus();
          return true;
        },
      },
    ];
  };

  /** Arrow-key boundary crossing: when the caret is at the edge of CM and would
   * leave the block, move the PM selection out instead. Verbatim from upstream. */
  private maybeEscape = (unit: "line" | "char", dir: -1 | 1): boolean => {
    if (!this.cm) return false;
    const { state } = this.cm;
    let main: SelectionRange | Line = state.selection.main;
    if (!main.empty) return false;
    if (unit === "line") main = state.doc.lineAt(main.head);
    if (dir < 0 ? main.from > 0 : main.to < state.doc.length) return false;

    const targetPos = (this.getPos() ?? 0) + (dir < 0 ? 0 : this.node.nodeSize);
    const selection = TextSelection.near(
      this.view.state.doc.resolve(targetPos),
      dir,
    );
    const tr = this.view.state.tr.setSelection(selection).scrollIntoView();
    this.view.dispatch(tr);
    this.view.focus();
    return true;
  };

  /** PM→CM: place the CM selection (PM crossing into the block). Force-inits CM
   * if needed (matches upstream `setSelection`). */
  setSelection(anchor: number, head: number) {
    const cm = this.forceInit();
    if (!cm.dom.isConnected) return;
    cm.focus();
    this.updating = true;
    cm.dispatch({ selection: { anchor, head } });
    this.updating = false;
  }

  /** Focus CM when PM selects the whole node. Force-inits if needed. */
  selectNode() {
    this.forceInit().focus();
  }

  /**
   * PM→CM diff sync — call when the React component re-renders with a new `node`
   * (a fresh `node`/decorations from PM). Returns false if it's a different node
   * type. Mirrors upstream `update()`: reconfigure read-only + language, then
   * apply the minimal `computeChange` diff (guarded by `updating`).
   */
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    if (this.updating) return true;

    this.node = node;

    if (!this.cm) return true;

    this.updateLanguage();
    if (this.view.editable === this.cm.state.readOnly) {
      this.cm.dispatch({
        effects: this.readOnlyConf.reconfigure(
          EditorState.readOnly.of(!this.view.editable),
        ),
      });
    }

    const change = computeChange(
      this.cm.state.doc.toString(),
      node.textContent,
    );
    if (change) {
      this.updating = true;
      this.cm.dispatch({
        changes: { from: change.from, to: change.to, insert: change.text },
        scrollIntoView: true,
      });
      this.updating = false;
    }
    return true;
  }

  destroy() {
    unregister(this.view, this);
    this.cm?.destroy();
    this.cm = null;
  }
}

/** Minimal-diff between two strings (so PM→CM dispatches the smallest change and
 * the CM cursor doesn't jump). Verbatim from upstream. */
function computeChange(
  oldVal: string,
  newVal: string,
): { from: number; to: number; text: string } | null {
  if (oldVal === newVal) return null;

  let start = 0;
  let oldEnd = oldVal.length;
  let newEnd = newVal.length;

  while (start < oldEnd && oldVal.charCodeAt(start) === newVal.charCodeAt(start))
    ++start;

  while (
    oldEnd > start &&
    newEnd > start &&
    oldVal.charCodeAt(oldEnd - 1) === newVal.charCodeAt(newEnd - 1)
  ) {
    oldEnd--;
    newEnd--;
  }

  return { from: start, to: oldEnd, text: newVal.slice(start, newEnd) };
}
