# Changelog

## 1.2.1 — only name a CJK font when the document needs one

### Fixed
- **A detected CJK font could break Latin-only exports.** 1.2.0 backfills the
  CJK font setting on load for every install with a CJK font on disk, and the
  setting was then passed to Pandoc on *every* render. fontspec aborts the
  whole run if it can't resolve the family — so on a platform where the
  detector's file-to-family mapping is wrong (the Linux Noto CJK names are the
  likely case; some distros ship the family without the `SC` suffix), a
  document with no CJK in it at all would stop producing a PDF, where 1.1.1
  compiled it fine. `CJKmainfont` is now passed only when the compiled document
  actually contains CJK text, so a Latin-only export can't be affected by the
  setting whatever it holds.

### Added
- `hasCjkText()` in `src/text-utils.ts` — covers ideographs (including
  extension A, the supplementary-plane extensions and the compatibility
  block), kana, hangul, CJK punctuation and fullwidth forms, and deliberately
  does **not** match pinyin diacritics or accented Latin.
- `test/harness.js` now also bundles `text-utils.ts`, so its helpers are
  directly unit-testable (88 edge-case tests total).

## 1.2.0 — tables, image embeds, CJK text, and CSV column control

### Fixed
- **Tables that Obsidian renders but Pandoc didn't.** Obsidian lets a pipe
  table begin on the line directly after a paragraph, a list item, or an
  image; Pandoc requires a blank line and otherwise swallows the table into
  the running paragraph, printing it as a stream of literal `|` characters.
  `src/tables.ts` re-separates a real table (a delimiter row under a row of
  pipes) before Pandoc sees it, leaving fenced code and blockquote bodies
  alone.
- **Image embeds inside a table cell were lost entirely.** Obsidian requires
  the pipe in `![[shot.png|300]]` to be escaped as `\|` inside a cell, which
  left a trailing backslash on the filename, failed the extension test, and
  degraded the whole embed to the bare text `!300`. Both spellings are now
  accepted.
- **Obsidian's pixel size hints were discarded**, so every image rendered at
  the full width of the text block. `![[shot.png|300]]` and
  `![[shot.png|300x200]]` now carry over as Pandoc width/height attributes.
- **Consecutive image embeds ran together side by side** and overflowed the
  right margin, because Pandoc reads two adjacent embed lines as one
  paragraph. Each image-only line now gets its own block, matching how
  Obsidian stacks them.
- **One unreadable attachment killed the entire render.** A `.webp`, `.gif`,
  `.svg`, `.avif`, `.heic`, `.tiff`, or `.bmp` embed reached xelatex as
  `\includegraphics` and aborted the run with "Unknown graphics extension",
  losing the PDF. Those formats now degrade to a visible
  `[image format not supported by LaTeX: ...]` marker.
- **Depth-capped appendix content skipped every rewrite.** A page pulled in
  at the depth limit was emitted raw, so its images arrived as bare
  `!name.png` text and its tables as literal pipes. It now goes through the
  same passes as a walked page.
- **Characters the LaTeX engine couldn't draw vanished silently.** xelatex
  reports an unrenderable glyph on stderr and omits it; Pandoc still exits 0,
  so a note of Chinese vocabulary exported with the CJK font setting empty
  (the default) reported "✓ PDF saved" with every hanzi missing. The
  completion notice now names the dropped characters and points at the
  setting.
- **A long CJK export could fail outright.** Each dropped glyph costs ~110
  bytes of warning output, enough for a large vocabulary rollup to overrun
  Node's 1 MB `execFile` buffer, kill Pandoc mid-run, and report a build
  error for a document that would have compiled. The buffer is now 32 MB.
- **Chinese/Japanese/Korean characters were dropped from every PDF.** The CJK
  font setting shipped blank, and with it blank the engine draws no hanzi,
  kana or hangul at all — which is what the two entries above only *reported*.
  `detectCjkFont()` now finds an installed CJK font by checking known font
  files on disk (PingFang SC / Songti SC / Hiragino Sans GB on macOS,
  Microsoft YaHei / SimSun on Windows, Noto Sans CJK / WenQuanYi on Linux),
  and the setting is backfilled on load wherever it is still empty — not only
  on first install, since every existing install starts blank. Settings gains
  a "Locate" button for it, matching the Pandoc and PDF-engine fields.
- **Image embeds inside a `csv-view` table never resolved.** CSV expansion ran
  *after* image resolution, so an `![[shot.png]]` living in a CSV cell was
  spliced into the page too late to be rewritten and reached the PDF as the
  bare text `!shot.png`. The passes are reordered so spliced-in CSV Markdown
  goes through image resolution and span styling like anything typed into the
  note.

### Added
- **`columns:` and `hide:` directives for `csv-view` blocks.** `columns:` is an
  ordered allowlist — the PDF shows those columns in the order written in the
  directive, not the order they appear in the file — and `hide:` drops columns
  from whatever `columns:` left, so both compose when given together. Names
  match ignoring case and surrounding whitespace; a name matching no column is
  ignored rather than failing the render. The filter is applied before grouping
  and collapsing, so `mode:`/`collapse:` operate on the columns that remain.
- **The ```` ```csv-inline ```` fence name is recognised** alongside
  ```` ```csv-view ````. The two differ only in on-screen layout, which has no
  analogue in a PDF, so both become one static table.
- A README section documenting CSV blocks and, in particular, that a `file:`
  path containing a slash but no leading `./` resolves from the vault root
  rather than from the note.

### Added
- Cases Z, AA, AB, AC and AD in `examples/edge-cases` covering all of the
  above — including a table whose entire header row is image embeds over CJK
  body rows, and `csv-view`/`csv-inline` tables whose cells carry embeds and
  CJK text — and 33 tests over them (86 edge-case tests total, up from 53).

## 1.0.2 — release provenance + build cleanup

### Added
- `.github/workflows/release.yml` builds in CI and attaches a cryptographic
  build-provenance attestation (`actions/attest-build-provenance`) to
  release assets, so `main.js` can be verified as actually built from this
  source rather than trusting a locally-built upload.
- A "Permissions & behavior" README section disclosing the plugin's
  filesystem access, shell execution, and full vault enumeration upfront.

### Removed
- The `builtin-modules` dev dependency — redundant with esbuild's
  `platform: "node"`, which already treats Node core modules as external
  without an explicit list (verified: bundle output is byte-identical
  with and without it).

## 1.0.1 — Pandoc/xelatex auto-detection

### Added
- `src/detect.ts` checks known install locations for Pandoc and a PDF engine
  directly by filesystem existence, sidestepping the fact that Obsidian.app
  is launched by Finder/launchd and doesn't inherit shell PATH entries (e.g.
  Homebrew's `/opt/homebrew/bin`) — a bare `pandoc`/`xelatex` that resolves
  fine in a terminal can fail inside Obsidian with `spawn pandoc ENOENT`.
  Used to pre-populate settings on first install, and via a "Locate" button
  next to each path field in Settings.
- README rewritten with a real before/after example (rendered through the
  actual plugin, not a mockup) and a sharper pitch up top.

## 1.0.0 — plugin rewrite

The renderer is now a real Obsidian plugin instead of a set of Templater
scripts. The rendering logic (`walk`, CSV-view expansion, LaTeX header) is
unchanged; what changed is how it's installed, configured, and invoked.

### Changed
- **Templater dependency dropped.** The four `templates/*.md` scripts are
  retired; the plugin registers its own commands and no longer requires the
  Templater community plugin.
- **Per-template config blocks replaced by a Settings tab.** Pandoc path, PDF
  engine path, CJK font, and page margin are now set once in
  **Settings → Rollup to PDF** instead of edited into each template file.
- **The four templates are now four commands**, run from the command palette:
  full recursion, max 1 level, max 2 levels, and appendix mode.
- **Pandoc invocation hardened.** Switched from a shell-interpolated command
  string to `execFile` with an argument array, so a note title or path
  containing quotes or shell metacharacters can no longer be misinterpreted
  as shell syntax.
- Source of truth moved to `src/*.ts`; the test suite now bundles and
  exercises that TypeScript directly instead of extracting JS from a
  Templater script.

### Fixed
- **Non-Latin scripts no longer break the export.** Switched the PDF engine
  from `pdflatex` to `xelatex`, so Chinese (and other Unicode scripts) render
  instead of failing with
  `! LaTeX Error: Unicode character … not set up for use with LaTeX`.

### Added
- A CJK font setting (blank by default; `PingFang SC` on macOS or `Noto Sans
  CJK SC` on Linux/Windows are common choices) passed to Pandoc as
  `-V CJKmainfont`, giving CJK glyphs a real font. Requires the `xecjk` LaTeX
  package (`tlmgr install xecjk ctex` on minimal TeX installs).

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

### Added
- **Appendix mode** (`templates/rollup-appendix.md`): a variant that moves each
  linked note to a numbered appendix at the end (`<section>.<subsection>.<n>`,
  recursing into deeper numbers) and leaves a "(see Appendix X.Y.Z)" reference
  in the body. Output saved as `<Note> (appendix).pdf`.

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
