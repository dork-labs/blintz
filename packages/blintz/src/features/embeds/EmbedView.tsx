import {
  Component,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useNodeViewContext } from "@prosemirror-adapter/react";
import { toString } from "mdast-util-to-string";

import { useEditorEditable } from "../../shared/editor-ctx";
import { cx } from "../../shared/cx";
import {
  validateEmbedAttributes,
  type EmbedAttributes,
  type EmbedIssue,
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
  const issues = useValidation(definition?.validate, attributes);
  const labelText = label ? toString({ type: "paragraph", children: label } as never) : "";

  const content = container ? (
    <div className="blintz-embed-content" ref={contentRef} />
  ) : undefined;

  const updateAttributes = editable
    ? (next: EmbedAttributes) => {
        const pos = getPos();
        if (pos == null || !view.editable) return;
        view.dispatch(view.state.tr.setNodeAttribute(pos, "attributes", { ...next }));
      }
    : undefined;

  let body: ReactNode;
  if (!definition) {
    body = (
      <Notice tone="neutral" title={directiveSource(container, name, attributes)}>
        No component is registered for “{name}”. It stays in the document unchanged.
      </Notice>
    );
  } else if (issues === "pending") {
    body = <div className="blintz-embed-pending" aria-busy="true" />;
  } else if (issues.length > 0) {
    body = (
      <Notice tone="error" title={directiveSource(container, name, attributes)}>
        <ul>
          {issues.map((issue, index) => (
            <li key={index}>{formatIssue(issue)}</li>
          ))}
        </ul>
      </Notice>
    );
  } else {
    const Embed = definition.component;
    body = (
      <EmbedBoundary name={name} resetKey={node}>
        <Embed
          name={name}
          attributes={attributes}
          label={labelText}
          editable={editable}
          updateAttributes={updateAttributes}
        >
          {content}
        </Embed>
      </EmbedBoundary>
    );
  }

  // Unknown, invalid or failed embeds still keep a container's content
  // editable: render it below the notice so nothing in the document is hidden.
  const rendered = definition && issues !== "pending" && issues.length === 0;
  return (
    <div
      className={cx("blintz-embed", selected && "is-selected")}
      data-embed-name={name}
      data-embed-state={!definition ? "unknown" : rendered ? "ready" : issues === "pending" ? "pending" : "invalid"}
      contentEditable={container ? undefined : false}
    >
      {body}
      {!rendered && content}
    </div>
  );
}

function useValidation(
  validator: Parameters<typeof validateEmbedAttributes>[0],
  attributes: EmbedAttributes,
): readonly EmbedIssue[] | "pending" {
  const [state, setState] = useState<{ key: unknown; issues: readonly EmbedIssue[] } | null>(null);
  const key = validator ? JSON.stringify(attributes) : null;
  useEffect(() => {
    if (!validator) return;
    let live = true;
    void validateEmbedAttributes(validator, attributes).then((result) => {
      if (live) setState({ key: { validator, key }, issues: result.issues ?? [] });
    });
    return () => {
      live = false;
    };
    // `attributes` is a fresh object per render; `key` is its stable identity.
  }, [validator, key]);
  if (!validator) return [];
  const current = state?.key as { validator: unknown; key: unknown } | undefined;
  if (!current || current.validator !== validator || current.key !== key) return "pending";
  return state!.issues;
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
  { name: string; resetKey: unknown; children: ReactNode },
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
    console.error(`[blintz] embed "${this.props.name}" failed to render`, error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <Notice tone="error" title={`::${this.props.name}`}>
          This embed failed to render: {this.state.error.message}
        </Notice>
      );
    }
    return this.props.children;
  }
}
