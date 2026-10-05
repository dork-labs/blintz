import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { matchesSourceDocument } from "./source-plugin";
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
  #acknowledged?: { doc: EditorState["doc"]; text: string; generation: string; controlled: boolean };
  #ack?: { transaction: Transaction; previous: EditorState; parsed: ParsedSource; generation: string; applied: boolean; committed: boolean };
  parse?: (text: string, state?: EditorState) => ParsedSource;
  callbacks: SourceCallbacks = {};
  readonly port: MarkdownSourcePort = {
    applyConfirmedTaskToggle: (request, text) => this.applyConfirmedTaskToggle(request, text),
    generation: () => this.generation,
    snapshot: () => this.snapshot(),
    selection: (generation) => this.selection(generation),
    taskAt: (position, generation) => this.taskAt(position, generation),
    bindSource: (text, generation) => {
      const refusal = this.refusal(generation);
      if (refusal && refusal.reason !== "unmapped") return refusal;
      const view = this.view,
        currentGeneration = this.generation,
        parse = this.parse;
      if (!parse || !view) return { kind: "unavailable", reason: "unmapped" };
      const changed = ():
        { kind: "unavailable"; reason: "disposed" | "stale" } | undefined => {
        if (this.disposed) return { kind: "unavailable", reason: "disposed" };
        if (
          this.view !== view ||
          this.parse !== parse ||
          this.generation !== currentGeneration
        )
          return { kind: "unavailable", reason: "stale" };
      };
      let parsed: ParsedSource;
      try {
        parsed = parse.call(this, text, view.state);
      } catch {
        return changed() ?? { kind: "unavailable", reason: "unmapped" };
      }
      const afterParse = changed();
      if (afterParse) return afterParse;
      const matches = matchesSourceDocument(this, parsed.doc, view.state);
      const afterMatch = changed();
      if (afterMatch) return afterMatch;
      if (!matches) return { kind: "unavailable", reason: "model-mismatch" };
      this.install(parsed);
      this.selectionChanged();
      return this.snapshot();
    },
  };
  private applyConfirmedTaskToggle(request: SourceTaskToggleRequest, text: string): SourceLocationResult<SourceSnapshot> {
    const refusal = this.refusal(request.generation);
    if (refusal) return refusal;
    const view = this.view, original = this.parsed, parse = this.parse;
    if (!view || !original || !parse || this.#ack) return { kind: "unavailable", reason: "unmapped" };
    const generation = this.generation, previous = view.state;
    const sameRange = (a: SourceTask["marker"], b: SourceTask["marker"]) =>
      a.start === b.start && a.end === b.end && a.startLine === b.startLine && a.endLine === b.endLine && a.startColumn === b.startColumn && a.endColumn === b.endColumn;
    const entry = [...original.tasks].find(([, task]) => task.line === request.task.line && task.checked === request.task.checked && sameRange(task.marker, request.task.marker) && sameRange(task.item, request.task.item));
    if (!entry) return { kind: "unavailable", reason: "unmapped" };
    const [position, task] = entry;
    const marker = task.marker;
    if (marker.end - marker.start !== 3 || !/^\[[ xX]\]$/.test(original.text.slice(marker.start, marker.end)) || typeof request.done !== "boolean") return { kind: "unavailable", reason: "model-mismatch" };
    const expected = request.done === task.checked ? original.text : original.text.slice(0, marker.start + 1) + (request.done ? "x" : " ") + original.text.slice(marker.start + 2);
    if (text !== expected) return { kind: "unavailable", reason: "model-mismatch" };
    let parsed: ParsedSource;
    try { parsed = parse.call(this, text, previous); } catch { return { kind: "unavailable", reason: "unmapped" }; }
    if (this.disposed || this.view !== view || this.parsed !== original || this.parse !== parse || this.generation !== generation || view.state !== previous) return { kind: "unavailable", reason: "stale" };
    const node = previous.doc.nodeAt(position);
    if (!node || node.type.name !== "list_item" || node.attrs.checked !== task.checked) return { kind: "unavailable", reason: "model-mismatch" };
    const transaction = previous.tr.setNodeMarkup(position, undefined, { ...node.attrs, checked: request.done }).setMeta("addToHistory", false);
    const stage = { transaction, previous, parsed, generation, applied: false, committed: false };
    this.#ack = stage;
    try {
      view.dispatch(transaction);
      if (!stage.committed) return { kind: "unavailable", reason: "model-mismatch" };
      if (this.disposed || this.view !== view || this.parsed !== parsed || this.#acknowledged?.generation !== this.generation || view.state.doc !== this.#acknowledged.doc) return { kind: "unavailable", reason: "stale" };
      return this.snapshot();
    } finally {
      if (this.#ack === stage) this.#ack = undefined;
      if (!stage.committed && (stage.applied || view.state !== previous)) this.invalidate();
    }
  }
  /** Only the exact privately staged marker transaction may carry new raw mapping through apply. */
  applyConfirmedSource(transaction: Transaction, previous: EditorState, state: EditorState): boolean {
    const stage = this.#ack;
    if (!stage || stage.applied || stage.transaction !== transaction || stage.previous !== previous || stage.generation !== this.generation || !state.doc.eq(transaction.doc) || !matchesSourceDocument(this, stage.parsed.doc, state)) return false;
    stage.applied = true;
    return true;
  }
  /** Publish mapping only after the real view has committed the privately staged transaction. */
  finishConfirmedSource(view: EditorView, previous: EditorState) {
    const stage = this.#ack;
    if (!stage || !stage.applied || stage.committed || this.view !== view || stage.previous !== previous || stage.generation !== this.generation) return;
    if (!matchesSourceDocument(this, stage.parsed.doc, view.state)) { this.invalidate(); return; }
    stage.committed = true;
    this.#acknowledged = { doc: view.state.doc, text: stage.parsed.text, generation: `${this.id}:${this.revision + 1}`, controlled: this.parsed?.text !== stage.parsed.text };
    this.install(stage.parsed);
  }
  /** Suppress a serializer notification for the exact already-persisted marker model only. */
  confirmedChangeText(state: EditorState): string | undefined {
    const stage = this.#ack;
    if (stage?.applied && stage.generation === this.generation &&
        matchesSourceDocument(this, stage.parsed.doc, state)) return stage.parsed.text;
    return this.#acknowledged?.doc === state.doc ? this.#acknowledged.text : undefined;
  }
  /** Consume only the single controlled value accompanying the exact committed marker model. */
  consumeConfirmedValue(text: string): boolean {
    const confirmed = this.#acknowledged;
    if (!confirmed?.controlled || confirmed.text !== text || confirmed.generation !== this.generation || this.view?.state.doc !== confirmed.doc) return false;
    confirmed.controlled = false;
    return true;
  }
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
  /** A derived-only transaction may preserve existing evidence, never restore it. */
  preserveSource(state: EditorState): boolean {
    const stage = this.#ack;
    if (stage?.applied && !stage.committed)
      return stage.generation === this.generation &&
        matchesSourceDocument(this, stage.parsed.doc, state);
    return !!this.parsed && matchesSourceDocument(this, this.parsed.doc, state);
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
