# Changelog

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
