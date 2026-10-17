import type { Node } from "@milkdown/kit/prose/model";
import { StepMap } from "@milkdown/kit/prose/transform";

/** A run of positions that is compared as one unit: a word, a gap, a node edge. */
interface Token {
  pos: number;
  size: number;
  key: string;
}

/** Past this many differing tokens, fall back to one span (rewrites are rare and big). */
const MAX_EDITS = 1000;

const WORDS = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

/** The top-level blocks of `doc` from index `first` that start before `end`, as tokens, and where they end. */
function tokens(doc: Node, first: number, start: number, end: number): { list: Token[]; to: number } {
  const list: Token[] = [];
  let to = start;
  for (let index = first, offset = start; index < doc.childCount && offset < end; index++) {
    const block = doc.child(index);
    push(list, block, offset);
    block.descendants((node, pos) => push(list, node, offset + 1 + pos));
    offset += block.nodeSize;
    to = offset;
  }
  // Close tokens were pushed early; put everything in document order.
  list.sort((x, y) => x.pos - y.pos);
  return { list, to };
}

function push(list: Token[], node: Node, pos: number): boolean {
  if (node.isText) {
    for (const match of node.text!.matchAll(WORDS)) {
      list.push({ pos: pos + match.index!, size: match[0].length, key: `t${match[0]}` });
    }
    return false;
  }
  if (node.isLeaf) {
    list.push({ pos, size: node.nodeSize, key: `l${node.type.name}${JSON.stringify(node.attrs)}` });
    return false;
  }
  list.push({ pos, size: 1, key: `o${node.type.name}` });
  list.push({ pos: pos + node.nodeSize - 1, size: 1, key: `c${node.type.name}` });
  return true;
}

/** The edit script between two token lists, as [aStart, aEnd, bStart, bEnd] hunks (Myers). */
function hunks(a: Token[], b: Token[]): Array<[number, number, number, number]> | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    // Round d only reads diagonals -d-1..d+1, so keep just that window.
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x]!.key === b[y]!.key) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) return null;
  // Walk back through the trace, collecting the non-matching runs.
  const out: Array<[number, number, number, number]> = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const window = trace[d]!;
    const at = (diagonal: number) => window[diagonal + d + 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = d === 0 ? 0 : prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
    }
    if (d > 0) {
      const hunk: [number, number, number, number] = [prevX, x, prevY, y];
      const last = out[out.length - 1];
      // Adjacent single edits merge into one hunk.
      if (last && last[0] === x && last[2] === y) {
        last[0] = prevX;
        last[2] = prevY;
      } else out.push(hunk);
    }
    x = prevX;
    y = prevY;
  }
  return out.reverse();
}

/** Where a token run starts; the end of the compared blocks when the run is empty at the end. */
function posOf(list: Token[], index: number, end: number): number {
  return index < list.length ? list[index]!.pos : end;
}

/**
 * A position map between two versions of a document that changed in one
 * opaque step (a collaborator's update), built from a word-level diff so
 * text that did not change keeps its place even when edits surround it.
 * Only the top-level blocks between the first and last difference are compared.
 * `exact` is false when the change was too big to diff and the whole differing
 * span is mapped as one replacement, so ranges inside it collapse even if
 * their words survived.
 */
export function diffMap(before: Node, after: Node): { map: StepMap; exact: boolean } {
  const start = before.content.findDiffStart(after.content);
  if (start === null) return { map: StepMap.empty, exact: true };
  let { a: endBefore, b: endAfter } = before.content.findDiffEnd(after.content)!;
  // On repeated content the two scans can cross; widen to stay consistent.
  const overlap = start - Math.min(endBefore, endAfter);
  if (overlap > 0) {
    endBefore += overlap;
    endAfter += overlap;
  }
  // The blocks before `start` are identical, so both sides begin at the same block.
  let first = 0;
  let blockStart = 0;
  while (first < before.childCount && blockStart + before.child(first).nodeSize <= start) {
    blockStart += before.child(first).nodeSize;
    first++;
  }
  const a = tokens(before, first, blockStart, endBefore);
  const b = tokens(after, first, blockStart, endAfter);
  const found = hunks(a.list, b.list);
  if (!found) return { map: new StepMap([start, endBefore - start, endAfter - start]), exact: false };
  const ranges: number[] = [];
  for (const [aStart, aEnd, bStart, bEnd] of found) {
    const from = posOf(a.list, aStart, a.to);
    ranges.push(from, posOf(a.list, aEnd, a.to) - from, posOf(b.list, bEnd, b.to) - posOf(b.list, bStart, b.to));
  }
  return { map: new StepMap(ranges), exact: true };
}
