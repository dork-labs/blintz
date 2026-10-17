import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useNodeViewContext } from "@prosemirror-adapter/react";
import { toString } from "mdast-util-to-string";

import { useEditorEditable } from "../../shared/editor-ctx";
import { cx } from "../../shared/cx";
import {
  ATTRIBUTE_KEY,
  validateEmbedAttributes,
  type EmbedAttributes,
  type EmbedIssue,
  type EmbedValidationResult,
  type EmbedValidator,
} from "./grammar";
import { lookupEmbed, useEmbedRegistry } from "./registry";
import type { EmbedNodeAttrs } from "./schema";

/** Leaf directive view: `::name{…}`. */
export function EmbedView() {
  return <EmbedFrame container={false} />;
}

/** Container directive view: `:::name … :::`; PM content mounts in `contentRef`. */
export function EmbedContainerView() {
  return <EmbedFrame container />;
}

function directiveSource(container: boolean, name: string, attributes: EmbedAttributes) {
  const pairs = Object.entries(attributes).map(([k, v]) => `${k}="${v}"`);
  return `${container ? ":::" : "::"}${name}${pairs.length ? `{${pairs.join(" ")}}` : ""}`;
}

function EmbedFrame({ container }: { container: boolean }) {
  const { node, view, getPos, selected, contentRef } = useNodeViewContext();
  const { name, attributes, label } = node.attrs as EmbedNodeAttrs;
  const editable = useEditorEditable(view);
  const definition = lookupEmbed(useEmbedRegistry(), name);
  const validation = useValidation(definition?.validate, attributes);
  const labelText = useMemo(
    () => (label ? toString({ type: "paragraph", children: label } as never) : ""),
    [label],
  );

  // A container's editable content must stay in the document even when the
  // host component never renders `children` (or throws): after each commit,
  // if the content element did not attach, render it under the frame instead.
  const contentEl = useRef<HTMLElement | null>(null);
  const attachContent = useCallback(
    (element: HTMLElement | null) => {
      contentEl.current = element;
      contentRef(element);
    },
    [contentRef],
  );
  const [orphaned, setOrphaned] = useState<unknown>(null);
  const placement = `${name}\u0000${definition ? "known" : "unknown"}`;
  const contentOrphaned = container && orphaned === placement;

  const ready = !!definition && validation !== "pending" && validation.length === 0;
  const hostOwnsContent = container && ready && !contentOrphaned;
  const content = container ? (
    <div className="blintz-embed-content" ref={attachContent} />
  ) : undefined;

  // Checked against the frame, not the document: on first commit the node
  // view is not yet inserted into the editor, so `isConnected` is false.
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = contentEl.current;
    if (container && !contentOrphaned && !(element && frame.current?.contains(element))) {
      setOrphaned(placement);
    }
  });

  const updateAttributes = useMemo(() => {
    if (!editable) return undefined;
    return (next: EmbedAttributes) => {
      const invalid = Object.keys(next).filter((key) => !ATTRIBUTE_KEY.test(key));
      if (invalid.length > 0) {
        throw new Error(`[blintz] invalid embed attribute name: ${invalid.join(", ")}`);
      }
      const values = Object.entries(next).filter(([, value]) => typeof value !== "string");
      if (values.length > 0) {
        throw new Error(`[blintz] embed attribute values must be strings: ${values.map(([k]) => k).join(", ")}`);
      }
      const pos = getPos();
      if (pos == null || !view.editable) return;
      view.dispatch(view.state.tr.setNodeAttribute(pos, "attributes", { ...next }));
    };
  }, [editable, getPos, view]);

  let body: ReactNode;
  if (!definition) {
    body = (
      <Notice tone="neutral" title={directiveSource(container, name, attributes)}>
        No component is registered for “{name}”. It stays in the document unchanged.
      </Notice>
    );
  } else if (validation === "pending") {
    body = <div className="blintz-embed-pending" aria-busy="true" />;
  } else if (validation.length > 0) {
    body = (
      <Notice tone="error" title={directiveSource(container, name, attributes)}>
        <ul>
          {validation.map((issue, index) => (
            <li key={index}>{formatIssue(issue)}</li>
          ))}
        </ul>
      </Notice>
    );
  } else {
    const Embed = definition.component;
    body = (
      <EmbedBoundary source={directiveSource(container, name, attributes)} resetKey={node}>
        <Embed
          name={name}
          attributes={attributes}
          label={labelText}
          editable={editable}
          updateAttributes={updateAttributes}
        >
          {hostOwnsContent ? content : undefined}
        </Embed>
      </EmbedBoundary>
    );
  }

  return (
    <div
      ref={frame}
      className={cx("blintz-embed", selected && "is-selected")}
      data-embed-name={name}
      data-embed-state={
        !definition ? "unknown" : validation === "pending" ? "pending" : ready ? "ready" : "invalid"
      }
      contentEditable={container ? undefined : false}
    >
      {body}
      {container && !hostOwnsContent && content}
    </div>
  );
}

function hasIssues(result: EmbedValidationResult): readonly EmbedIssue[] {
  return result.issues?.length ? result.issues : [];
}

/**
 * Validate synchronously when the validator answers synchronously (the common
 * case), so the host component never unmounts between attribute changes. An
 * async validator shows "pending" only before its first answer; after that
 * the last answer stays on screen while the next one runs.
 */
function useValidation(
  validator: EmbedValidator | undefined,
  attributes: EmbedAttributes,
): readonly EmbedIssue[] | "pending" {
  const key = JSON.stringify(attributes);
  const immediate = useMemo((): readonly EmbedIssue[] | Promise<EmbedValidationResult> => {
    if (!validator) return [];
    try {
      const result =
        typeof validator === "function"
          ? validator(JSON.parse(key) as EmbedAttributes)
          : validator["~standard"].validate(JSON.parse(key));
      if (result && typeof (result as Promise<unknown>).then === "function") {
        return validateEmbedAttributes(validator, JSON.parse(key) as EmbedAttributes);
      }
      return hasIssues(result as EmbedValidationResult);
    } catch (error) {
      return [{ message: error instanceof Error ? error.message : String(error) }];
    }
  }, [validator, key]);

  const [settled, setSettled] = useState<readonly EmbedIssue[] | null>(null);
  useEffect(() => {
    if (Array.isArray(immediate)) return;
    let live = true;
    void (immediate as Promise<EmbedValidationResult>).then((result) => {
      if (live) setSettled(hasIssues(result));
    });
    return () => {
      live = false;
    };
  }, [immediate]);

  if (Array.isArray(immediate)) return immediate;
  return settled ?? "pending";
}

function formatIssue(issue: EmbedIssue): string {
  const path = issue.path
    ?.map((part) => String(typeof part === "object" ? part.key : part))
    .join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "neutral" | "error";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("blintz-embed-notice", tone === "error" && "is-error")} role={tone === "error" ? "alert" : undefined}>
      <code className="blintz-embed-notice-source">{title}</code>
      <div className="blintz-embed-notice-body">{children}</div>
    </div>
  );
}

/** A host component that throws shows a notice instead of breaking the editor. */
class EmbedBoundary extends Component<
  { source: string; resetKey: unknown; children: ReactNode },
  { error: Error | null; resetKey: unknown }
> {
  override state = { error: null as Error | null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { resetKey: unknown },
    state: { error: Error | null; resetKey: unknown },
  ) {
    // A changed node (new attributes) gets a fresh attempt.
    return props.resetKey !== state.resetKey
      ? { error: null, resetKey: props.resetKey }
      : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[blintz] embed ${this.props.source} failed to render`, error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <Notice tone="error" title={this.props.source}>
          This embed failed to render: {this.state.error.message}
        </Notice>
      );
    }
    return this.props.children;
  }
}
