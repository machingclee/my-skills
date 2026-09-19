---
name: tool--article-generation
description: >-
  Generate or rewrite long-form markdown content such as tutorials, guides,
  how-to documents, walkthroughs, setup docs, technical writeups, study notes,
  and blog posts. Also trigger when writing or editing markdown files under
  docs/, src/mds/articles/, or any path containing "guide", "tutorial", or
  "article" in the filename.
---

# Article Generation Style

## Mandatory Trigger

This skill must be invoked via the Skill tool whenever the user's request matches any of the following. Do not generate tutorial or article content without first loading this skill.

- The user uses the words "tutorial", "guide", "how-to", "walkthrough", "setup doc", "documentation", "explainer", "writeup", "study notes", "blog post", or "article" to describe what they want.
- The user says "generate a tutorial", "write a tutorial", "create an article", "generate an article", "write a guide", or any similar phrase that combines a creation verb with a long-form content noun.
- The target file path contains `docs/`, `src/mds/articles/`, or a filename with `Guide`, `Tutorial`, `Article`, `Setup`, or `HowTo` in it.
- The user asks for a standalone markdown document longer than a few paragraphs that is intended to teach, explain, or walk through something.

If any of these conditions are met, call `Skill("article-generation-style")` before writing any content. The skill contains formatting rules, file location conventions, and frontmatter requirements that must be applied.

## Rules for Generating or Rewriting
- Titles should not start from present continuous tense, "Debugging ..." should be "Debug ...".
- Do not check nearby articles for style reference; apply the rules below directly.
- Use "we" and "our" instead of "you" and "your".
- Avoid bold text `** **`; use only when truly necessary. The one expected exception is the starting title of a `>>` titled block, described below.
- Do not remove any Chinese comments in code blocks.
- All coding related syntax must be wrapped in backticks `` ` `` — class names, annotations, method names, keywords, field names, access level constants, and code expressions. This applies to body text and section headings alike.
- Section headings must not start with numbering (`1.`, `2.`, `3.`, etc.). Use plain text titles instead.
- Do not use emoji anywhere.
- Do not use `---` (horizontal rule) as a section separator.
- Do not use a `—` as a sentence-level conjunction within paragraphs. Use commas or restructure the sentence instead.
- Never line-break long sentences or paragraphs. Keep each paragraph in a single line. The user will wrap text in their editor.
- Prefer bullet lists over long paragraphs when the content is enumerating things. If a stretch of prose is packing several reasons, cases, fields, steps, constraints, trade-offs, outcomes, or similar items, split it into bullets. Do not flatten a list into one dense paragraph.
- Lead with one short sentence, then bullets. Each bullet is one item and stays to one or two short sentences. Nested bullets are fine when an item has a few sub-points.
- Keep a paragraph only when the point is a single idea, a short narrative, or a setup that then leads into a list. Do not use a bullet list for a one-sentence aside.
- Use numbered lists for ordered steps. Use unordered bullets for unordered sets. That is the default.
- When each item in a set deserves a short starting title, use a `>>` titled block instead of a plain bullet list. Each item is its own block, and a single blank line separates one block from the next. Every line of a block starts with `>> `:

  ```markdown
  >> **The starting title.**  The first line of that item.
  >> The content continues on the next line.

  >> **The next starting title.**  Its content.
  >> The content continues.
  ```

  - The starting title is bold, and its period sits inside the bold, as in `**Title.**`.
  - That closing period is always the ASCII `.`, in English and in Traditional Chinese alike. Never close a starting title with the full-width `。`, even when the title text is Chinese.
  - An ordered title closes the same way: `>> **2 Field mapping.**`, and in Chinese `>> **2 欄位映射.**`.
  - Leave two spaces between the closing `**` and the content that follows it.
  - When the items are ordered, put the number directly inside the bold title with no brackets and no separator: `>> **1 Some Title.**`, then `>> **2 Another Title.**`, and so on.
  - A blank line inside a single block is written as a bare `>>` with nothing after it.
  - The block ends when the lines stop starting with `>>`. There is no closing marker, and a line of `>>>` is never used.
  - This is the one place bold is expected, so the `** **` restriction above does not apply to a starting title.
  - Apply this in Traditional Chinese as well: in the `-tc.md` companion, keep the `>>` markers and the bold, and translate the title text.
- Group closely related topics under a parent section (`###`) with child subsections (`####`). Avoid long flat lists of same-level headings. Use `#####` for deeper nesting when a subsection benefits from further breakdown.
- When an article covers many topics, cluster them into a multi-level hierarchy that uses at least three heading levels (`###`, `####`, and `#####`). Prefer grouping related items under broader sections rather than listing many same-level headings side by side. Example shape: `### Domain Area` → `#### Capability` → `##### Concrete Step Or Detail`. Apply this whenever the outline would otherwise become a long flat list of peer sections.
- Bound the depth you add. Nesting is for grouping distinct topics, not for cutting one explanation into pieces. Before creating a deeper level, check that the level above it already holds two or more distinct topics:
  - Use `#####` only when its parent `####` has two or more `#####` children, or when a lone `#####` child sits under a `####` that also carries prose of its own.
  - Never emit a `####` or `#####` that is a pure wrapper, meaning a heading whose entire content is one child heading and nothing else.
  - Keep sibling headings at the same level. Do not let one item of a set sit at `#####` while its peers sit at `####`.
  - A short block with no code block, no table, and no distinctly named error, API, flag, or command is usually a list item rather than a topic. Leave it as a bullet under the heading that already exists instead of promoting it to a heading.
  - A thin heading is still correct when it introduces a code block or table, names a distinct error or failure mode under a troubleshooting parent, or names an API a reader would scan for. Judge by whether the reader navigates to it, not by length alone.
- When an article centers on a complete code listing or script, show the full, runnable listing in its own section first, then break it into component subsections that explain each part and reference the listing. The complete code precedes the explanation, not the other way around.
- All titles must use Title Case: capitalize the first letter of each major word. Words such as "as", "to", "and", "or", "but" should be lowercase unless they are the first word of the title.
- Every article must include the following frontmatter block at the top:

  ```markdown
  ---
  title: "Spring Boot Integration Test Setup Guide"
  date: 2026-06-07
  id: blog0511
  uuid: "9f2c5d1e-4a3b-4c2d-9e8f-1a2b3c4d5e6f"
  tag: springboot, java, test
  img: springboot
  toc: true
  intro: "A standalone walkthrough for configuring and running command handler integration tests."
  indent: true
  wip: false
  ---
  ```

- Every article must include a `uuid` field in the frontmatter (see the example above), placed right after `id`. Generate a fresh UUID v4 (e.g. `9f2c5d1e-4a3b-4c2d-9e8f-1a2b3c4d5e6f`) for each new article — never reuse a uuid from an existing article.
- When creating the Traditional Chinese version (`xxx-name-tc.md`) of an article, it must reuse the exact same `uuid` as the English `xxx-name.md`. The uuid identifies the article across languages, so the two files always share one value.

- Immediately after the frontmatter block, every article must include the following `<style>` block:

  ```html
  <style>
    img {
      max-width: 660px !important;
    }
    table td:first-child, table th:first-child {
      min-width: 160px;
    }
  </style>
  ```

- Every section heading (`###`, `####`, etc.) must carry an anchor:

  ```
  ### Some Title {#some-title}
  ```

  Use these `{#anchor}` anchors when cross-referencing between sections (e.g., "see [Some Title](#some-title)").

- When creating a new article, write the file under the project's article directory (typically `src/mds/articles/tech/` or `docs/`) using the naming convention that prefixes the markdown file with a sequential number (check existing files for the next available number). Ask the user if the path is unknown.


## Structure of the article

Make sure to reorganize the article into ###, ####, ##### and ###### to better structure the content, don't simply use 2 levels ###, #### as it is hard to read.

Headings group topics. Bullets unpack a topic. When a section would otherwise become a long paragraph that is secretly a list, use bullets inside that section instead of more prose or another heading.
