/** Original input locations use UTF-16 offsets, never DOM or serialized markdown. */
export interface SourceSnapshot {
  generation: string;
  text: string;
}
export interface RawSourceRange {
  start: number;
  end: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
export type SourceLocationResult<T> =
  | { kind: "mapped"; generation: string; value: T }
  | {
      kind: "unavailable";
      reason: "stale" | "unmapped" | "disposed" | "model-mismatch";
    };
export interface SourceSelection {
  ranges: RawSourceRange[];
  direction: "forward" | "backward";
}
export interface SourceTask {
  item: RawSourceRange;
  marker: RawSourceRange;
  line: number;
  checked: boolean;
}
export interface SourceTaskToggleRequest {
  generation: string;
  task: SourceTask;
  done: boolean;
}
export interface MarkdownSourcePort {
  /** Apply a host-confirmed single task marker to the current mapped model without resetting history.
   * This UI transaction is not a persistence receipt; the host must verify its writer acknowledgement. */
  applyConfirmedTaskToggle(request: SourceTaskToggleRequest, text: string): SourceLocationResult<SourceSnapshot>;
  generation(): string;
  snapshot(): SourceLocationResult<SourceSnapshot>;
  selection(generation?: string): SourceLocationResult<SourceSelection>;
  taskAt(
    modelPosition: number,
    generation?: string,
  ): SourceLocationResult<SourceTask>;
  /** Bind genuine host-supplied raw bytes only when their parse equals the live model.
   * Does not replace the model or change selection/history. Not a persistence receipt. */
  bindSource(
    text: string,
    generation: string,
  ): SourceLocationResult<SourceSnapshot>;
}
/** Private snapshot-owned index; building it scans the original text exactly once. */
export interface RawCoordinateMap {
  range(start: number, end: number): RawSourceRange;
}
export function createRawCoordinateMap(text: string): RawCoordinateMap {
  const starts = [0];
  for (let offset = 0; offset < text.length; offset++) {
    const unit = text.charCodeAt(offset);
    if (unit === 13) {
      if (text.charCodeAt(offset + 1) === 10) offset++;
      starts.push(offset + 1);
    } else if (unit === 10) starts.push(offset + 1);
  }
  const point = (offset: number) => {
    // Match slice's endpoint normalization for the standalone helper as well.
    const integral = Math.trunc(offset) || 0;
    const position =
      integral < 0
        ? Math.max(0, text.length + integral)
        : Math.min(text.length, integral);
    let low = 0,
      high = starts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle]! <= position) low = middle;
      else high = middle;
    }
    // A prefix ending between CR and LF already contains one line break.
    // After LF it remains the same next-line/column-one point.
    if (
      text.charCodeAt(position) === 10 &&
      text.charCodeAt(position - 1) === 13
    )
      return { line: low + 2, column: 1 };
    return { line: low + 1, column: position - starts[low]! + 1 };
  };
  return {
    range(start, end) {
      const a = point(start),
        b = point(end);
      return {
        start,
        end,
        startLine: a.line,
        startColumn: a.column,
        endLine: b.line,
        endColumn: b.column,
      };
    },
  };
}
/** Standalone lookup; parsed snapshots reuse their own index for repeated queries. */
export function rawRange(
  text: string,
  start: number,
  end: number,
): RawSourceRange {
  return createRawCoordinateMap(text).range(start, end);
}
