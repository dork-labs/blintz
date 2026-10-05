import type { Node, NodeType, NodeSpec } from "@milkdown/kit/prose/model";

/** Inspect only enumerable own data, matching the pinned core's object spread. */
function ownData(value: object): Map<PropertyKey, unknown> | undefined {
  const entries = new Map<PropertyKey, unknown>();
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable) continue;
    if (!("value" in descriptor)) return;
    entries.set(key, descriptor.value);
  }
  return entries;
}
function sameData(a: Map<PropertyKey, unknown>, b: Map<PropertyKey, unknown>) {
  return (
    a.size === b.size &&
    [...a].every(([key, value]) => b.has(key) && b.get(key) === value)
  );
}

/** Exact Milkdown 7.22.1 core extendPriority association, not structural branding. */
export function matchesHeadingSpec(
  original: NodeSpec & { priority?: number },
  actual: NodeSpec,
): boolean {
  const source = ownData(original),
    target = ownData(actual);
  if (!source || !target) return false;
  const parseDOM = source.get("parseDOM");
  source.delete("parseDOM");
  const transformed = target.get("parseDOM");
  if (!target.has("parseDOM")) return false;
  target.delete("parseDOM");
  if (!sameData(source, target)) return false;
  if (parseDOM === undefined) return transformed === undefined;
  if (
    !Array.isArray(parseDOM) ||
    !Array.isArray(transformed) ||
    parseDOM.length !== transformed.length
  )
    return false;
  const priority = Object.getOwnPropertyDescriptor(original, "priority");
  if (priority && !("value" in priority)) return false;
  for (let index = 0; index < parseDOM.length; index++) {
    const sourceRule = Object.getOwnPropertyDescriptor(parseDOM, String(index));
    const targetRule = Object.getOwnPropertyDescriptor(
      transformed,
      String(index),
    );
    if (
      !sourceRule ||
      !("value" in sourceRule) ||
      !targetRule ||
      !("value" in targetRule)
    )
      return false;
    if (
      !sourceRule.value ||
      !targetRule.value ||
      typeof sourceRule.value !== "object" ||
      typeof targetRule.value !== "object"
    )
      return false;
    const rule = ownData(sourceRule.value),
      actualRule = ownData(targetRule.value);
    if (!rule || !actualRule) return false;
    const expected = new Map<PropertyKey, unknown>([
      ["priority", priority?.value],
    ]);
    for (const [key, value] of rule) expected.set(key, value);
    if (!sameData(expected, actualRule)) return false;
  }
  return true;
}

/** Only the closed source-plugin assembly may decide this heading type is owned. */
export function matchesDerivedHeadingDocument(
  parsed: Node,
  actual: Node,
  heading: NodeType,
): boolean {
  if (
    parsed.type.schema !== actual.type.schema ||
    heading.schema !== actual.type.schema
  )
    return false;
  // Preserve the upstream {} counter, including its inherited-name behavior.
  // Unsupported inherited slugs refuse instead of changing Milkdown's generator.
  const ids: Record<string, number> = {};
  let valid = true;
  const compare = (a: Node, b: Node): boolean => {
    if (
      a.type !== b.type ||
      (!a.sameMarkup(b) && a.type !== heading) ||
      a.childCount !== b.childCount
    )
      return false;
    if (a.type === heading) {
      const expected = { ...a.attrs };
      if (a.textContent.trim().length) {
        let id = a.textContent.toLowerCase().trim().replace(/\s+/g, "-");
        if (id in ids && !Object.prototype.hasOwnProperty.call(ids, id)) {
          valid = false;
          return false;
        }
        if (ids[id]) {
          ids[id] += 1;
          id += `-#${ids[id]}`;
        } else ids[id] = 1;
        expected.id = id;
      }
      if (!heading.create(expected, a.content, a.marks).sameMarkup(b))
        return false;
    }
    if (a.isText && a.text !== b.text) return false;
    for (let i = 0; i < a.childCount; i++)
      if (!compare(a.child(i), b.child(i))) return false;
    return true;
  };
  return compare(parsed, actual) && valid;
}
