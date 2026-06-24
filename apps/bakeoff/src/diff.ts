/**
 * Tiny line-level diff for the "diff vs seed" view. Not a full Myers diff — a
 * cheap LCS over lines is plenty to show round-trip drift (added/removed lines)
 * in a dev tool. We also expose a quick char-level summary.
 */

export interface DiffSummary {
  changed: boolean;
  addedLines: number;
  removedLines: number;
  charDelta: number;
  /** Per-line rows for a side-by-side-ish unified view. */
  rows: DiffRow[];
}

export type DiffRow =
  | { kind: "same"; text: string }
  | { kind: "add"; text: string }
  | { kind: "del"; text: string };

/** Longest-common-subsequence over lines, then walk back to a unified diff. */
export function diffMarkdown(seed: string, current: string): DiffSummary {
  const a = seed.split("\n");
  const b = current.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = dp[i]!;
      if (a[i] === b[j]) {
        row[j] = dp[i + 1]![j + 1]! + 1;
      } else {
        row[j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      rows.push({ kind: "del", text: a[i]! });
      removed++;
      i++;
    } else {
      rows.push({ kind: "add", text: b[j]! });
      added++;
      j++;
    }
  }
  while (i < n) {
    rows.push({ kind: "del", text: a[i]! });
    removed++;
    i++;
  }
  while (j < m) {
    rows.push({ kind: "add", text: b[j]! });
    added++;
    j++;
  }

  return {
    changed: current !== seed,
    addedLines: added,
    removedLines: removed,
    charDelta: current.length - seed.length,
    rows,
  };
}
