import type { EditorView } from "@milkdown/kit/prose/view";
import {
  type MarkdownSourcePort,
  type SourceLocationResult,
  type SourceSelection,
  type SourceSnapshot,
  type SourceTask,
  type SourceTaskToggleRequest,
} from "./source-location";
import type { ParsedSource } from "./source-parser";
export interface SourceCallbacks {
  onSourceReady?: (port: MarkdownSourcePort) => void;
  onSourceSelection?: (result: SourceLocationResult<SourceSelection>) => void;
  onTaskToggleRequest?: (request: SourceTaskToggleRequest) => void;
}
let incarnation = 0;
export class SourceController {
  private readonly id = ++incarnation;
  private revision = 0;
  private controlRevision = 0;
  private generation = `${this.id}:0`;
  private parsed?: ParsedSource;
  private view?: EditorView;
  private disposed = false;
  parse?: (text: string) => ParsedSource;
  callbacks: SourceCallbacks = {};
  readonly port: MarkdownSourcePort = {
    generation: () => this.generation,
    snapshot: () => this.snapshot(),
    selection: (generation) => this.selection(generation),
    taskAt: (position, generation) => this.taskAt(position, generation),
    bindSource: (text, generation) => {
      const refusal = this.refusal(generation);
      if (refusal && refusal.reason !== "unmapped") return refusal;
      if (!this.parse || !this.view)
        return { kind: "unavailable", reason: "unmapped" };
      let parsed: ParsedSource;
      try {
        parsed = this.parse(text);
      } catch {
        return { kind: "unavailable", reason: "unmapped" };
      }
      if (!parsed.doc.eq(this.view.state.doc))
        return { kind: "unavailable", reason: "model-mismatch" };
      this.install(parsed);
      this.selectionChanged();
      return this.snapshot();
    },
  };
  attach(view: EditorView) {
    if (this.disposed) return;
    this.view = view;
    this.callbacks.onSourceReady?.(this.port);
  }
  install(parsed: ParsedSource) {
    this.parsed = parsed;
    this.generation = `${this.id}:${++this.revision}`;
    this.view?.dom.dispatchEvent(new Event("blintz:source"));
  }
  invalidate() {
    this.parsed = undefined;
    this.generation = `${this.id}:${++this.revision}`;
    this.view?.dom.dispatchEvent(new Event("blintz:source"));
  }
  dispose() {
    this.disposed = true;
    this.parsed = undefined;
    this.view = undefined;
    this.generation = `${this.id}:${++this.revision}`;
  }
  /** A generation is available even while locations are unmapped, for guarded rebinding. */
  get currentGeneration() {
    return this.generation;
  }
  private refusal(
    generation?: string,
  ):
    | { kind: "unavailable"; reason: "stale" | "unmapped" | "disposed" }
    | undefined {
    if (this.disposed) return { kind: "unavailable", reason: "disposed" };
    if (generation !== undefined && generation !== this.generation)
      return { kind: "unavailable", reason: "stale" };
    if (!this.parsed) return { kind: "unavailable", reason: "unmapped" };
  }
  private snapshot(): SourceLocationResult<SourceSnapshot> {
    const refusal = this.refusal();
    return (
      refusal ?? {
        kind: "mapped",
        generation: this.generation,
        value: { generation: this.generation, text: this.parsed!.text },
      }
    );
  }
  private taskAt(
    position: number,
    generation?: string,
  ): SourceLocationResult<SourceTask> {
    const refusal = this.refusal(generation);
    if (refusal) return refusal;
    const task = this.parsed!.tasks.get(position);
    return task
      ? {
          kind: "mapped",
          generation: this.generation,
          value: {
            ...task,
            item: { ...task.item },
            marker: { ...task.marker },
          },
        }
      : { kind: "unavailable", reason: "unmapped" };
  }
  private selection(
    generation?: string,
  ): SourceLocationResult<SourceSelection> {
    const refusal = this.refusal(generation);
    if (refusal) return refusal;
    if (!this.view) return { kind: "unavailable", reason: "unmapped" };
    const selection = this.view.state.selection,
      parsed = this.parsed!;
    const spans = parsed.texts.filter(
      (span) => span.to >= selection.from && span.from <= selection.to,
    );
    const ranges = spans
      .filter((span) =>
        selection.empty
          ? selection.from >= span.from && selection.from <= span.to
          : selection.to > span.from && selection.from < span.to,
      )
      .map((span) => {
        const from = Math.max(selection.from, span.from),
          to = Math.min(selection.to, span.to);
        return parsed.coordinates.range(
          span.rawFrom + from - span.from,
          span.rawFrom + to - span.from,
        );
      });
    // Every selected text unit must have direct parser-origin evidence.
    let selectedText = 0,
      unsupportedLeaf = false;
    this.view.state.doc.nodesBetween(
      selection.from,
      selection.to,
      (node, pos) => {
        if (node.isLeaf && !node.isText) unsupportedLeaf = true;
        if (node.isText)
          selectedText += Math.max(
            0,
            Math.min(selection.to, pos + node.nodeSize) -
              Math.max(selection.from, pos),
          );
      },
    );
    if (
      unsupportedLeaf ||
      !ranges.length ||
      ranges.length > 100 ||
      ranges.reduce((n, range) => n + range.end - range.start, 0) !==
        selectedText ||
      (selection.empty &&
        new Set(ranges.map((range) => range.start)).size !== 1)
    )
      return { kind: "unavailable", reason: "unmapped" };
    return {
      kind: "mapped",
      generation: this.generation,
      value: {
        ranges,
        direction: selection.anchor <= selection.head ? "forward" : "backward",
      },
    };
  }
  setCallbacks(callbacks: SourceCallbacks) {
    const readyChanged =
      callbacks.onSourceReady !== this.callbacks.onSourceReady;
    this.callbacks = callbacks;
    this.controlRevision++;
    if (!this.disposed && this.view && readyChanged)
      callbacks.onSourceReady?.(this.port);
  }
  get controlSnapshot() {
    return `${this.generation}:${this.controlRevision}`;
  }
  refreshControls() {
    this.view?.dom.dispatchEvent(new Event("blintz:source"));
  }
  selectionChanged() {
    this.callbacks.onSourceSelection?.(this.selection());
  }
  toggle(position: number, done: boolean): boolean {
    if (!this.callbacks.onTaskToggleRequest) return false;
    const task = this.taskAt(position);
    if (task.kind === "mapped")
      this.callbacks.onTaskToggleRequest({
        generation: task.generation,
        task: task.value,
        done,
      });
    return true;
  }
}
