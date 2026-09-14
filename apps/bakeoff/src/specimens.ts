/** Markdown specimens shared by the visual playground and browser regression suite. */
export const SPECIMENS = {
  overview: {
    label: "A little of everything",
    markdown: `# A place for good ideas

Writing should feel effortless. A clear thought, a little **emphasis**, and enough room to breathe. This is **bold**, *italic*, ~~a change of mind~~, and a useful [link](https://milkdown.dev).

## Start with the essentials

- Make the important things clear.
- Give related ideas room to stay together.
  - A nested thought belongs with its parent.
  - Even when it wraps onto another line, its marker should stay aligned.
- Let the words do the work.

### A small plan

1. Find the right words.
2. Put them in order.
3. Read it once more.

- [x] Find a quiet place to write.
- [ ] Leave something worth reading.

> Good design is as little design as possible.
>
> Keep the thought. Lose the noise.

## Details that matter

An inline expression like \`const idea = "simple"\` should sit comfortably inside a sentence. So should a little math: $E = mc^2$.

\`\`\`ts
// A small function, with a clear purpose.
export function greet(name: string): string {
  const message = "Hello, " + name;
  return message;
}
\`\`\`

| Detail | Intention | Ready |
| :--- | :---: | ---: |
| Typography | Clear hierarchy | Yes |
| Spacing | A steady rhythm | Yes |
| Color | Easy to read | Yes |

---

A final thought, and a fresh paragraph.
`,
  },
  lists: {
    label: "Lists & checkboxes",
    markdown: `# One thought at a time

## Unordered

- A short first item.
- A longer second item that wraps naturally at narrow widths, with its first line aligned to exactly one marker.
  - A nested bullet.
    - A third level with **emphasis** and \`inline code\`.
  - Back to the second level.
- Back to the beginning.

## Ordered

8. Begin at eight.
9. Continue at nine.
10. Double digits keep the same alignment.
    1. A nested numbered step.
    2. Its neighbor.
11. The next step.

## A little more room

- This item contains two paragraphs.

  This second paragraph belongs to the same item.

- This is a separate item.

## Tasks

- [ ] A task to do.
- [x] A task already done.
- [ ] A longer task that wraps without the checkbox drifting away from its first line.
  - [ ] A nested task.
`,
  },
  typography: {
    label: "Type & spacing",
    markdown: `# Heading one

A paragraph after the first heading. **Strong words**, *gentle emphasis*, ~~removed words~~, and \`inline code\` all share the same baseline.

## Heading two

A second paragraph with a [descriptive link](https://milkdown.dev) and a deliberate hard break.  
This line stays in the same paragraph.

### Heading three

Text at the third level.

#### Heading four

Text at the fourth level.

##### Heading five

Text at the fifth level.

###### Heading six

The smallest heading still has a clear role.

> A quote with **strong text** and *emphasis*.
>
> A second paragraph inside the quote.
>
> - A list can belong in a quote too.
> - Its rhythm should still be clear.

---

A new section begins with a paragraph.
`,
  },
  technical: {
    label: "Code, tables & math",
    markdown: `---
title: A precise little document
status: draft
---

# Small details, clearly expressed

Inline code: \`a_very_long_function_name_that_should_wrap_in_a_narrow_editor_without_breaking_the_page()\`.

\`\`\`ts
// Comments need to be readable in both themes.
export function describe(value: number): string {
  const label = "A useful result";
  return value > 10 ? label : "Keep going";
}
\`\`\`

\`\`\`json
{ "ready": true, "count": 42, "name": "Blintz" }
\`\`\`

| Left aligned | Center aligned | Right aligned |
| :--- | :---: | ---: |
| A meaningful label | **Emphasis** | 1,024 |
| Another row | \`code\` | 256 |
| A_long_unbroken_cell_value_that_must_not_widen_the_entire_page | Center | 16 |

Inline math belongs with the sentence: $a^2 + b^2 = c^2$.

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$
`,
  },
  media: {
    label: "Images & long content",
    markdown: `# Room for the whole picture

![A quiet landscape](/specimen-landscape.svg "A quiet place to think")

An image has a caption and respects the width of its page.

A long link: [https://example.com/a/long/path/that/keeps/going/without/any/spaces/and/should/still/stay/inside/the/editor](https://example.com).

AnUnbrokenWordThatIsDeliberatelyLongEnoughToChallengeTheLayoutOnASmallPhoneWithoutForcingTheEntirePageToScrollSideways.
`,
  },
  empty: { label: "A blank page", markdown: "" },
} as const;

export type SpecimenId = keyof typeof SPECIMENS;
