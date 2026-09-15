---
name: writing-for-humans
description: 'Writes user-facing Blintz prose a reader can take in on one pass: release notes, the README, npm package copy, the GitHub repo description, playground copy, and error messages. Use when writing or reviewing any copy a person (not a coding agent) will read.'
---

# Writing for Humans

Every word a reader sees should be plain enough to take in on one pass. Blintz's readers are mostly developers deciding whether to install it, but they are skimming, often in a hurry, and sometimes reading in a second language. This skill is the readability standard for user-facing Blintz writing.

## The readability contract

Hold every user-facing sentence to these five rules:

1. **Aim for a 9th-grade reading level.** If a sentence needs a second read, rewrite it.
2. **Keep sentences short.** Aim under 20 words. Never pack two big ideas into one sentence. Split them.
3. **Use active voice with a clear actor.** Say who does what: "Blintz saves your document as clean markdown," not "clean markdown is produced."
4. **Lead with the benefit, then the mechanism (if at all).** Say what the reader gets first. Most of the time you can drop the mechanism.
5. **Define or drop every technical term.** Either avoid the jargon or gloss it in the same sentence. Prefer numbers and concrete scenarios over abstractions.

House punctuation rule: no em dashes. They invite run-on sentences that smuggle in a second idea; use a comma, colon, parentheses, or a new sentence instead.

## What this governs (and what it does not)

**Governs** every surface a person reads: release notes, the README, npm package copy, the GitHub repo description, playground copy, and error messages.

**Does not govern** surfaces written for developers working on Blintz itself or for coding agents, which stay precise and technical:

- ADRs → `writing-adrs`
- Code comments → keep them technical

When a page mixes both (a README with an API reference tail), split it with a clear heading like `## API` and a framing sentence so the reader knows the audience just shifted.

## Ten ways we ruin our writing

Each is a real quote from DorkOS writing (Blintz shares its house style), then a rewrite.

**1. Leading with mechanism instead of benefit.**
Before: "per-turn context (git status, UI state, queued-message notes) travels alongside them instead of being injected into the text."
After: "Your notes to the agent (like git status) now arrive as context, so the agent never mistakes them for something you typed."

**2. A ticket or PR ID carrying the meaning.**
Before: "Batch 9 — browser acceptance PASS; implementation complete (DOR-73)."
After: "Fix the chat losing your place when you switch between two running sessions (DOR-73)." The ID is a footnote; the sentence stands on its own.

**3. Acronyms with no gloss on first use.**
Before: "A ULID is assigned, providing a unique, time-ordered identifier."
After: "Each agent gets an ID that also records when it was created, so lists stay in order." Name the concept, not the acronym.

**4. Shipping a commit message to users.**
Before: "SDK-native breakdown via held-open prompt (A1)."
Can you tell what the user got? Neither can we, and that is the lesson: when the commit message does not tell you, do not paraphrase it into release notes. Dig into the PR or the code until you can say what changed for the reader, then write that sentence.

**5. One sentence carrying three or four ideas.**
Before: a single 68-word highlight making four separate claims.
After: one idea per sentence. Break it into a short lead plus a bullet each.

**6. A reference table with no framing sentence.**
Before: a props table dropped in with no lead-in.
After: "Most apps only need `value` and `onChange`. Here is the full list if you need it," then the table.

**7. Tonal whiplash: warm opening, then man-page.**
A README that opens with a story and then jumps to bare command lists reads like two documents. Bridge the shift with a sentence, or keep the reference in its own section.

**8. Describing a visual feature in text only.**
"A Notion-style block handle with drag-to-reorder" is telling, not showing. When a feature is visual, add a screenshot or short clip. (Media is a separate task, so at minimum flag the gap.)

**9. Internals mixed into a user page with no signal.**
A README that slides from "what you get" into ProseMirror plugin keys loses the reader mid-page. Put the deep-dive under its own heading and say who it is for.

**10. Passive, nominalized phrasing that hides the actor.**
Before: "An AgentManifest is assembled from discovery hints merged with any overrides you provide."
After: "DorkOS builds each agent's profile from what it finds on disk, plus any details you add."

## Self-checks before you ship

Run all five on the finished prose:

- **So what?** Ask "so what?" after each sentence. If the answer is not obvious, add the benefit or cut the line.
- **Explain-back.** Could a reader skim it once and explain it back? If not, simplify.
- **Acronym scan.** Find every acronym. Gloss it in the same sentence, or cut it.
- **Read aloud.** If you have to inhale in the middle of a sentence, split it.
- **Us or them?** Does the sentence describe what the _reader gets_, or what _we did_? Rewrite anything that is about us.

## When jargon is unavoidable

Some terms have no plain replacement. Name the term, then gloss it in the same breath:

- "ProseMirror (the editing engine Blintz is built on)"
- "round-trip (what you type comes back as the same markdown when you save)"
- "peer dependency (a package your app installs itself, like React)"

Gloss on first use only; after that the reader knows it.

## The honesty gate

Plain language never means overclaiming. Never say a feature works unless you have verified it. Describe what a reader can actually do today. No hype words ("powerful," "seamless," "effortless"): show the outcome instead.
