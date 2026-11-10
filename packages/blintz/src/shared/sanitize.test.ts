/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";

import { sanitize } from "./sanitize";

/** Parse sanitized output so assertions don't depend on DOMPurify's exact serialization. */
function parse(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = sanitize(html);
  return root;
}

describe("sanitize", () => {
  it("strips script elements", () => {
    const root = parse('<p>ok</p><script>alert(1)</script>');
    expect(root.querySelector("script")).toBeNull();
    expect(root.textContent).toBe("ok");
  });

  it("removes event-handler attributes", () => {
    const root = parse('<img src="x.png" onerror="alert(1)">');
    const img = root.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.hasAttribute("onerror")).toBe(false);
    expect(img!.getAttribute("src")).toBe("x.png");
  });

  it("drops javascript: hrefs", () => {
    const a = parse('<a href="javascript:alert(1)">x</a>').querySelector("a");
    expect(a).not.toBeNull();
    expect(a!.hasAttribute("href")).toBe(false);
    expect(a!.textContent).toBe("x");
  });

  it("keeps a plain link", () => {
    const root = parse('<a href="https://example.com/a?b=1" title="t">link</a>');
    const a = root.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com/a?b=1");
    expect(a?.getAttribute("title")).toBe("t");
    expect(a?.textContent).toBe("link");
  });

  it("keeps inline SVG icons intact", () => {
    const icon =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14"/></svg>';
    const svg = parse(icon).querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.querySelector("path")?.getAttribute("d")).toBe("M5 12h14");
  });

  it("strips scripts and handlers inside SVG", () => {
    const root = parse('<svg onload="alert(1)"><script>alert(2)</script><path d="M0 0"/></svg>');
    const svg = root.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.hasAttribute("onload")).toBe(false);
    expect(root.querySelector("script")).toBeNull();
    expect(svg!.querySelector("path")).not.toBeNull();
  });
});
