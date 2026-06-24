# Attribution & third-party licenses

**Blintz is a React port of [Milkdown](https://milkdown.dev)'s _Crepe_ editor.**
It reuses Milkdown's framework-agnostic engine (`@milkdown/kit`) as-is and
re-implements Crepe's Vue UI layer as React components (via
[`@prosemirror-adapter/react`](https://github.com/prosemirror-adapter/prosemirror-adapter)).
A substantial amount of CSS (the `--crepe-*` theme tokens and feature styles)
and view logic is **derived from, or copied from, Crepe**. All of it is used
under the MIT license. Blintz is **not** affiliated with or endorsed by the
Milkdown project — it is an independent derivative work.

Blintz itself is MIT-licensed (see [LICENSE](./LICENSE)).

---

## Milkdown / Crepe (the work this is ported from)

```
MIT License

Copyright (c) 2020-present Mirone

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Source: <https://github.com/Milkdown/milkdown> (`@milkdown/*`, including
`@milkdown/crepe`, `@milkdown/kit`, `@milkdown/react`, `@milkdown/theme-nord`).

---

## Other bundled / runtime dependencies

Blintz builds on the following open-source projects. Each is the property of
its respective authors and used under the stated license:

| Project | License |
| --- | --- |
| [ProseMirror](https://prosemirror.net) (`prosemirror-*`) | MIT — © Marijn Haverbeke and contributors |
| [`@prosemirror-adapter/react`](https://github.com/prosemirror-adapter/prosemirror-adapter) | MIT |
| [remark / unified / mdast](https://unifiedjs.com) (`remark-*`, `unist-util-*`) | MIT — © Titus Wormer |
| [`remark-math`](https://github.com/remarkjs/remark-math) | MIT |
| [KaTeX](https://katex.org) | MIT — © Khan Academy and contributors |
| [CodeMirror](https://codemirror.net) (`@codemirror/*`, `codemirror`) | MIT — © Marijn Haverbeke and contributors |
| [Lucide](https://lucide.dev) (`lucide-static`) | ISC — © Lucide Contributors (forked from Feather, MIT © Cole Bemis) |
| [Floating UI](https://floating-ui.com) (`@floating-ui/dom`) | MIT — © Floating UI contributors |
| [DOMPurify](https://github.com/cure53/DOMPurify) (`dompurify`) | Apache-2.0 OR MPL-2.0 — © Cure53 and contributors |
| [`prosemirror-virtual-cursor`](https://github.com/saljam/prosemirror-virtual-cursor) | MIT |

Full license texts for runtime dependencies are distributed within each
package under `node_modules/`.

---

## Upstream sync (ported modules)

Most of Blintz reuses the Milkdown engine unchanged and only re-implements the
**view** layer in React. A handful of modules, however, are **Vue-free
re-implementations of pure pieces** that Milkdown only ships inside Vue-bundled
`@milkdown/kit/component/*` packages (importing those would pull Vue into the
bundle). These were **ported from `@milkdown/kit` `^7.21.2`** and should be
re-verified on each Milkdown minor bump — in particular that any `$ctx` **slice
key names** still match upstream (a silent rename upstream would make a local
config diverge):

| Local module(s) | Ported from |
| --- | --- |
| `features/image-block/{schema,config,remark-plugin}.ts` | `@milkdown/kit/component/image-block` |
| `features/code-block/{config,loader}.ts` | `@milkdown/kit/component/code-block` |
| `features/table/{config,operation,pointer,utils}.ts` | `@milkdown/kit/component/table-block` |
| `features/link-tooltip/{slices,tooltips,store,utils,command,plugins}.ts` | `@milkdown/kit/component/link-tooltip` |
| `features/latex/*` | Crepe's Latex feature (built on `remark-math` + a code-block view) |
| `features/empty-paragraphs.ts` | derived from `@milkdown/preset-commonmark`'s empty-line handling |

When bumping `@milkdown/kit`, re-run the test suite (the `empty-paragraphs` guard
test will catch the most fragile assumption) and spot-check these modules.
