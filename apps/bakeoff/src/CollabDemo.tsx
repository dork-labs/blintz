import { useEffect, useMemo, useState } from "react";
import { MarkdownEditor } from "blintz";
import {
  applyMarkdownToYDoc,
  collaboration,
  createMarkdownModel,
  readYDoc,
  type MarkdownModel,
} from "blintz/collab";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";

const SEED = `# Shared notes

Two people are editing this page. Type on either side.

The agent can rewrite this line without touching anyone's typing.
`;

/** One person: their own Y.Doc and presence, wired to the others below. */
function usePeer() {
  return useMemo(() => {
    const doc = new Y.Doc();
    return { doc, awareness: new Awareness(doc) };
  }, []);
}

/**
 * Two editors and a "server" doc in one page, connected like a provider
 * would connect them: every update and presence change reaches the others.
 */
export function CollabDemo({ theme }: { theme: "light" | "dark" }) {
  const server = useMemo(() => new Y.Doc(), []);
  const left = usePeer();
  const right = usePeer();
  const [model, setModel] = useState<MarkdownModel | null>(null);
  const [agentNote, setAgentNote] = useState("");

  useEffect(() => {
    let live = true;
    void createMarkdownModel().then((m) => {
      if (!live) return;
      if (server.getXmlFragment("prosemirror").length === 0) applyMarkdownToYDoc(m, server, SEED);
      for (const peer of [left, right]) Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(server));
      const docs = [server, left.doc, right.doc];
      for (const doc of docs) {
        doc.on("update", (update: Uint8Array, origin: unknown) => {
          if (origin === "network") return;
          for (const other of docs) if (other !== doc) Y.applyUpdate(other, update, "network");
        });
      }
      const peers = [left.awareness, right.awareness];
      for (const awareness of peers) {
        awareness.on("update", ({ added, updated, removed }: Record<string, number[]>, origin: unknown) => {
          if (origin === "network") return;
          const update = encodeAwarenessUpdate(awareness, [...added!, ...updated!, ...removed!]);
          for (const other of peers) if (other !== awareness) applyAwarenessUpdate(other, update, "network");
        });
      }
      setModel(m);
    });
    return () => {
      live = false;
    };
  }, [server, left, right]);

  const leftPlugins = useMemo(
    () => [collaboration({ fragment: left.doc.getXmlFragment("prosemirror"), awareness: left.awareness, user: { name: "Ada", color: "#2f6fde" } })],
    [left],
  );
  const rightPlugins = useMemo(
    () => [collaboration({ fragment: right.doc.getXmlFragment("prosemirror"), awareness: right.awareness, user: { name: "Grace", color: "#c2410c" } })],
    [right],
  );

  const agentRewrite = () => {
    if (!model) return;
    const read = readYDoc(model, server);
    // An agent works on its copy for a while…
    setTimeout(() => {
      const edited = read.markdown.replace(
        /The agent can rewrite this line[^\n]*/,
        "The agent rewrote this line, and kept everyone's typing.",
      );
      applyMarkdownToYDoc(model, server, edited, { base: read.base, origin: "agent" });
      setAgentNote("The agent wrote its change against what it read.");
    }, 400);
  };

  if (!model) return <p>Connecting…</p>;
  return (
    <div className="collab-demo">
      <div className="collab-toolbar">
        <button type="button" onClick={agentRewrite}>
          Agent: rewrite the last line
        </button>
        <output aria-live="polite">{agentNote}</output>
      </div>
      <div className="collab-panes">
        <section aria-label="Ada's editor" className="specimen-paper">
          <MarkdownEditor value="" theme={theme} plugins={leftPlugins} />
        </section>
        <section aria-label="Grace's editor" className="specimen-paper">
          <MarkdownEditor value="" theme={theme} plugins={rightPlugins} />
        </section>
      </div>
    </div>
  );
}
