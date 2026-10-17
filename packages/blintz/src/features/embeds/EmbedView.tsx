import {
  Component,
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
  isAttributeKey,
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

  // A container's editable content lives in one element Blintz owns (`home`),
  // never one React owns. The host places it by rendering `children`, an
  // <EmbedContent> slot that adopts `home` while mounted. Whenever no slot is
  // mounted (a host that ignores `children`, renders them later, or throws;
  // an unknown, pending or invalid embed), `home` sits in the fallback below
  // the frame, so the content is always in the document and always editable.
  const [home] = useState(() => {
    const element = document.createElement("div");
    element.className = "blintz-embed-content";
    return element;
  });
  const fallback = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (container) contentRef(home);
  }, [container, contentRef, home]);
  const Slot = useMemo(() => {
    function EmbedContent() {
      const slot = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        const element = slot.current!;
        element.appendChild(home);
        return () => {
          if (home.parentNode === element) fallback.current?.appendChild(home);
        };
      }, []);
      return <div className="blintz-embed-slot" ref={slot} />;
    }
    return EmbedContent;
  }, [home]);
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Children's effects run first: if no slot claimed `home`, park it.
    if (container && !frame.current?.contains(home)) fallback.current?.appendChild(home);
  });

  const ready = !!definition && validation !== "pending" && validation.length === 0;

  const updateAttributes = useMemo(() => {
    if (!editable) return undefined;
    return (next: EmbedAttributes) => {
      const invalid = Object.keys(next).filter((key) => !isAttributeKey(key));
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
          {container ? <Slot /> : undefined}
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
      {container && <div className="blintz-embed-fallback" ref={fallback} />}
    </div>
  );
}

function hasIssues(result: EmbedValidationResult): readonly EmbedIssue[] {
  return result?.issues?.length ? result.issues : [];
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
  // One call per (validator, attributes): a sync answer is used as is; an
  // async one is wrapped once, so it never runs twice or rejects unhandled.
  const immediate = useMemo((): readonly EmbedIssue[] | Promise<readonly EmbedIssue[]> => {
    if (!validator) return [];
    try {
      const value = JSON.parse(key) as EmbedAttributes;
      const result =
        typeof validator === "function"
          ? validator(value)
          : validator["~standard"].validate(value);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        return Promise.resolve(result as Promise<EmbedValidationResult>).then(
          hasIssues,
          (error: unknown) => [{ message: describeError(error) }],
        );
      }
      return hasIssues(result as EmbedValidationResult);
    } catch (error) {
      return [{ message: describeError(error) }];
    }
  }, [validator, key]);

  const [settled, setSettled] = useState<readonly EmbedIssue[] | null>(null);
  useEffect(() => {
    if (Array.isArray(immediate)) return;
    let live = true;
    void (immediate as Promise<readonly EmbedIssue[]>).then((issues) => {
      if (live) setSettled(issues);
    });
    return () => {
      live = false;
    };
  }, [immediate]);

  if (Array.isArray(immediate)) return immediate;
  return settled ?? "pending";
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
