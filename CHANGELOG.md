# Changelog

## 2.4.0 — no-H1 authoring model + layout fixes

Adapts the renderer to notes written without H1 headings (Obsidian already
shows the note name) and fixes several layout issues surfaced in real PDFs.

### Changed
- **No-H1 model.** Notes are expected to start at `##`. The document title now
  comes from the root note's filename, and each page is shifted relative to its
  own shallowest heading (`offset = baseLevel - topLevel`) rather than assuming
  an H1 root. This keeps nesting correct: Politics → USA → Covert Operations →
  Operation → Section, one heading level per index hop.
- **Filename titles for bare links.** A link with no heading to reuse takes its
  section title from the linked note's filename, never its first body heading
  (which previously caused duplicated titles once H1s were removed).
- **Prose no longer breaks heading reuse.** Intro prose between a heading and
  its `→` link stays as the chapter intro; the link still adopts the heading.
- **Top-of-page bare links** now emit at the page's base level (not one too
  deep), removing skipped heading levels in reused indexes.

### Removed
- The `(continued)` re-anchor on headings. A new heading after an expanded link
  now simply renders at its own level (the old behaviour mislabelled the
  re-anchor and added TOC noise).

### Fixed
- **TOC indentation** tightened by redefining the LaTeX kernel's TOC entry
  macros (`\@dottedtocline`) directly, no extra package, so deep subheadings
  step in by smaller increments instead of drifting to the right margin.
- **Overview callout boxes** render flush-left at a consistent width regardless
  of section depth, with small interior padding, so a box under a deep section
  no longer insets or overflows the page.

### Authoring rules
- README now opens with a six-point "Authoring rules" section (no H1s,
  line-leading `→` for expansion, the chapter pattern, consistent chapter
  heading levels, bare-link lists, and `> [!summary]`/`> [!overview]` boxes).

## 2.3.0 — heading reuse (multi-level rollups)

Finalises the nesting model for deep, multi-level rollups.

### Changed
- **Heading reuse.** When a `→` link sits directly under a heading (only blank
  lines or a `> [!summary]` callout between), that heading becomes the section
  title and the linked page's content nests one level below it. The linked
  page's own H1 is always dropped. This makes every index hop exactly one
  heading level — Politics → USA → Covert Operations → Operation → Section —
  with no duplicated titles, and crucially **without** requiring the heading
  text to match the page title. (Earlier versions either duplicated the title
  or depended on an exact text match to dedupe.)
- A link that is NOT under a fresh heading (e.g. a bare list of sibling links,
  or a link after prose) still emits the linked page's title as its heading.

### Kept from 2.2.0
- LaTeX `titlesec` config so h4/h5 render as real standalone headings, plus
  `tocdepth`/`secnumdepth` 5 and `--toc-depth=5`, so deep sections appear as
  headings and in the table of contents.

## 2.2.0 — title dedupe + deep-heading rendering (superseded by 2.3.0)

## 2.1.0 — heading adoption (superseded)

## 2.0.0 — heading-relative redesign

Complete rewrite of the parsing model. **Index notes no longer need a fixed
`###` + positional-summary + `---` structure.** Every page is now parsed by a
single unified walker.

### Changed
- **Unified model.** No index/detail distinction. Every page is parsed the
  same way; a leaf is simply a page with no expansion links.
- **Heading-relative nesting.** A linked page renders one level below the
  nearest heading above its link, instead of every chapter being forced to
  `##`. The index can use any heading levels as ordinary markdown.
- **Explicit summaries.** Overview boxes are now `> [!summary]` / `> [!overview]`
  callouts placed wherever you want, not prose inferred from position.
- **`---` is no longer structural.** Use it for visual breaks freely.

### Added
- `(continued)` re-anchoring: prose or a deeper heading after an expanded link
  re-emits the active heading so it isn't misattributed to the expanded section.
- Cycle protection: a link back to a page already open on the branch renders as
  `*[see: X]*`.
- Strict resolution for path-qualified links (`[[Folder/Page]]`), closing the
  v1 stale-flat-file trap where a same-named sibling was picked up instead.
- Depth-limited variants driven by a single `MAX_DEPTH` constant.

### Fixed
- Duplicate root `# Title` in compiled output.
- Plain `>` blockquotes were eligible to be boxed; now only `[!summary]` /
  `[!overview]` callouts are.

### Demarcation rule
Only **line-leading** `→ [[...]]` links expand. List-item (`- → [[x]]`),
inline, and `->` ASCII arrows stay as plain text, cleanly separating expansion
links from cross-links without new syntax.
