# Rollup to PDF

A [Templater](https://github.com/SilentVoid13/Templates) script for Obsidian that compiles a tree of wiki-linked notes into a single, formatted PDF via [Pandoc](https://pandoc.org/).

Point it at any note. Every inline `→ [[link]]` is expanded in place, nested one heading level below its context, and the whole tree is recursively flattened into one document with a table of contents and styled overview boxes.

## Authoring rules (read first)

For a rollup to nest correctly, write notes this way:

1. **No H1 headings.** Start note content at `##`. Obsidian already shows the note name, and the rollup takes each section's title from the heading (or chapter link) that points to it.
2. **Expansion links go on their own line, starting with `→`.** A line-leading `→ [[Page]]` pulls that page inline. Any other arrow (`- → [[x]]`, inline `→`, `->`) stays as plain text, use those for cross-links you do *not* want expanded.
3. **A chapter is a heading + the link under it.** Put a `→ [[Page]]` directly under a heading; that heading becomes the section title and the linked page nests below it. A `> [!summary]` callout or intro prose between the heading and the link is fine, it stays as the chapter intro.
4. **Keep an index page's chapter headings at one consistent level** (e.g. all `##`). Mixing `##` and `###` for sibling chapters throws off the nesting.
5. **A bare list of `→` links** (no heading above each) gives each linked page its own section, titled from the filename.
6. **Use `> [!summary]` or `> [!overview]`** for the grey overview boxes. Plain `>` blockquotes pass through unchanged.

## How it works

The model is deliberately simple: **every page is parsed the same way.** There is no "index page" vs "content page" distinction. The renderer walks a page top to bottom, and wherever it finds a link on its own line starting with the `→` arrow, it pulls that page's content inline and recurses into it.

```markdown
## Techniques

> [!summary]
> Foundational methods that recur across recipes.
→ [[Techniques/Techniques]]
```

becomes, in the PDF:

```
## Techniques
   [ Overview box: Foundational methods that recur across recipes. ]
### Techniques            <- the linked page's H1, one level below "## Techniques"
#### Knife Skills         <- expanded recursively from inside Techniques
#### Emulsification
```

### The rules in one paragraph

A linked page renders **one heading level below the nearest heading above its link**. Two links under the same heading sit at the same level. A page's own headings shift to fit. When a link sits under a heading (blank lines, a `> [!summary]` callout, or intro prose between them is fine), that heading becomes the section title and the page nests below it; a bare link with no heading above it is titled from the linked note's filename. A new heading after an expanded link simply renders at its own level. Only **line-leading** `→ [[...]]` links expand — list items (`- → [[x]]`), inline arrows, and `->` ASCII arrows stay as plain text, so cross-links don't get pulled in. Cycles render as `*[see: X]*`. `> [!summary]` / `> [!overview]` callouts become styled boxes; plain `>` blockquotes are left alone.

Full details: [docs/authoring-guide.md](docs/authoring-guide.md).

## Install

1. Install the **Templater** community plugin.
2. Copy the templates into your Templater templates folder (Settings → Templater → *Template folder location*):
   - `templates/rollup-renderer.md` — full recursion
   - `templates/rollup-renderer-1.md` — expand one level below the root
   - `templates/rollup-renderer-2.md` — expand two levels below the root
   - `templates/rollup-appendix.md` — appendix mode: links move to numbered appendices at the end (see below)
3. Edit the config block at the top of each template to match your machine:
   ```js
   const PANDOC      = "/opt/homebrew/bin/pandoc";
   const PDF_ENGINE  = "/usr/local/bin/pdflatex";
   const MARGIN      = "2cm";
   ```
   Find your paths with `which pandoc` and `which pdflatex`.
4. Add the template as a command / tab-bar button (Templater settings), or run it via the command palette from the note you want as the document root.

Requires Pandoc and a LaTeX engine (e.g. MacTeX / TeX Live) with the `tcolorbox` package.

## Examples

- [`examples/Cookbook`](examples/Cookbook) — a small, readable knowledge base. Open `Cookbook.md` and run the template to see nesting, callouts, and cross-links in action.
- [`examples/edge-cases`](examples/edge-cases) — a stress vault covering every behaviour (nesting math, the h6 cap, cycles, resolution rules, callouts, non-expanding arrows). Used by the test suite.

## Tests

The test suite loads the renderer logic **directly out of the template file** — there is no second copy of the logic to drift out of sync. `test/harness.js` extracts the JS from `templates/rollup-renderer.md`, stubs the Obsidian vault API with the filesystem, and runs the real walker.

```bash
npm test
```

Covers 37 edge cases plus an end-to-end render of the Cookbook example.

## Appendix mode

`templates/rollup-appendix.md` is an alternative renderer. Instead of expanding each `→ [[link]]` inline, it moves the linked note's content to an **Appendices** section at the end of the document and leaves a reference where the link was:

```
**Covert Operations** (see Appendix 1.1.1)
```

Appendix numbers are positional: `<section>.<subsection>.<n>` based on where the link sits in the body, and links found inside an appendix recurse into deeper numbers (`1.1.1.2`, `1.1.1.2.1`, ...). The main body stays short, a table of references, while all the pulled-in detail lives in numbered appendices. Same link, callout, and config rules as the main template; output is saved as `<Note> (appendix).pdf`.

## License

MIT — see [LICENSE](LICENSE).
