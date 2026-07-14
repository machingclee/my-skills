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
- Avoid bold text `** **`; use only when truly necessary.
- Do not remove any Chinese comments in code blocks.
- Every section heading must be at least level-3 (`###`). Sub-sections use `####`.
- Do not use emoji anywhere.
- Do not use `---` (horizontal rule) as a section separator.
- Do not use a `—` as a sentence-level conjunction within paragraphs. Use commas or restructure the sentence instead.
- Never line-break long sentences or paragraphs. Keep each paragraph in a single line. The user will wrap text in their editor.
- Group closely related topics under a parent section (`###`) with child subsections (`####`). Avoid long flat lists of same-level headings.
- When an article centers on a complete code listing or script, show the full, runnable listing in its own section first, then break it into component subsections that explain each part and reference the listing. The complete code precedes the explanation, not the other way around.
- All titles must use Title Case: capitalize the first letter of each major word. Words such as "as", "to", "and", "or", "but" should be lowercase unless they are the first word of the title.
- Every article must include the following frontmatter block at the top:

  ```markdown
  ---
  title: "Spring Boot Integration Test Setup Guide"
  date: 2026-06-07
  id: blog0511
  tag: springboot, java, test
  img: springboot
  toc: true
  intro: "A standalone walkthrough for configuring and running command handler integration tests."
  indent: true
  wip: false
  ---
  ```

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

- When creating a new article, write the file to `/Users/chingcheonglee/Repos/Javascript/machingclee.github.io.source/app/src/mds/articles/tech/` using the naming convention that prefixes the markdown file with a sequential number (check existing files for the next available number).
