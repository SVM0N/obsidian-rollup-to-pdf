# Rollup to PDF

Turn a tree of wiki-linked Obsidian notes into one clean, typeset PDF — complete with a title page, table of contents, numbered sections, and styled callout boxes — in a single command.

Obsidian's built-in PDF export handles one note at a time, as-is. Rollup to PDF handles the whole tree: point it at an index note, and every line-leading `→ [[link]]` it finds gets pulled in and nested one heading level below where it was linked — recursively, through as many notes as your outline has — until the whole thing is flattened into a single [Pandoc](https://pandoc.org/)-typeset document. No re-typing your outline into a separate export tool, no manually stitching notes together before exporting.

**Good fit if** you keep a wiki-style knowledge base, recipe book, worldbuilding doc, or research notebook in Obsidian and want a polished PDF of the whole tree. **Not what you want if** you just need to export one note as-is — Obsidian's built-in PDF export already does that.

## See it in action

A note with a summary callout and one expansion link:

![A markdown note reading "## Sourdough Bread", a summary callout, and a → [[Levain]] expansion link, next to the PDF it compiles into: a title page, table of contents, and numbered sections with a styled overview box](docs/img/example.png)

That's the whole model: `→ [[Levain]]` under `## Sourdough Bread` becomes a numbered subsection one level below it, `[!summary]` becomes the shaded overview box, and the title page + table of contents are generated for free. Nest another index note under another heading and it keeps going, as deep as your outline goes.

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

This plugin is not yet in Obsidian's community plugin store. Until then, install it
with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install **BRAT** from Community Plugins and enable it.
2. In BRAT's settings, choose **Add Beta Plugin** and enter this repo's URL
   (`https://github.com/SVM0N/obsidian-rollup-to-pdf`).
3. Enable **Rollup to PDF** in Community Plugins.

(Or install manually: download `main.js`, `manifest.json`, and `styles.css` — if
present — from a [release](https://github.com/SVM0N/obsidian-rollup-to-pdf/releases)
into `<vault>/.obsidian/plugins/rollup-to-pdf/`, then enable it in Community Plugins.)

### Configure

Open **Settings → Rollup to PDF** and set:

- **Pandoc path** — `pandoc` if it's on your `PATH`, or a full path (find it with `which pandoc`).
- **PDF engine path** — a Unicode-capable LaTeX engine, e.g. `xelatex` (find it with `which xelatex`).
- **CJK font** — a font installed on your system for Chinese/Japanese/Korean glyphs, e.g. `PingFang SC` (macOS) or `Noto Sans CJK SC` (Linux/Windows). Leave blank if you don't need CJK support.
- **Page margin** — e.g. `2cm`.

### Render

Open the note you want as the document root, then run one of these from the
command palette:

- **Render rollup to PDF (full recursion)**
- **Render rollup to PDF (max 1 level deep)**
- **Render rollup to PDF (max 2 levels deep)**
- **Render rollup to PDF (appendix mode)** — see [Appendix mode](#appendix-mode) below

This plugin is desktop-only: it shells out to Pandoc and a LaTeX engine, neither of
which are available on mobile.

Requires Pandoc and **XeLaTeX** (e.g. MacTeX / TeX Live) with the `tcolorbox` and
`xecjk` packages. XeLaTeX is used instead of pdfLaTeX so non-Latin scripts (Chinese,
etc.) render instead of erroring out. On a minimal TeX install (BasicTeX / TinyTeX),
add the CJK support with:

```sh
tlmgr install xecjk ctex
```

## Examples

- [`examples/Cookbook`](examples/Cookbook) — a small, readable knowledge base. Open `Cookbook.md` and run **Render rollup to PDF** to see nesting, callouts, and cross-links in action.
- [`examples/edge-cases`](examples/edge-cases) — a stress vault covering every behaviour (nesting math, the h6 cap, cycles, resolution rules, callouts, non-expanding arrows, Multi-Column Markdown, image embeds, CSS snippet styling). Used by the test suite.

## Tests

The test suite loads the renderer logic **directly out of `src/`** — there is no second copy of the logic to drift out of sync. `test/harness.js` bundles `src/walker.ts` and `src/css-snippets.ts` (and their local dependencies) with esbuild, stubs the Obsidian vault API with the filesystem, and runs the real walker that ships inside `main.js`.

```bash
npm test
```

Covers 53 edge cases (including Multi-Column Markdown, image embeds, and CSS snippet styling) plus an end-to-end render of the Cookbook example.

## Appendix mode

The **appendix mode** command is an alternative render mode. Instead of expanding each `→ [[link]]` inline, it moves the linked note's content to an **Appendices** section at the end of the document and leaves a reference where the link was:

```
**Covert Operations** (see Appendix 1.1.1)
```

Appendix numbers are positional: `<section>.<subsection>.<n>` based on where the link sits in the body, and links found inside an appendix recurse into deeper numbers (`1.1.1.2`, `1.1.1.2.1`, ...). The main body stays short, a table of references, while all the pulled-in detail lives in numbered appendices. Same link, callout, and settings as the other commands; output is saved as `<Note> (appendix).pdf`.

## Images

`![[image.jpg]]` embeds are resolved to the real file on disk and rendered as actual images in the PDF (not just their filename as text). Works anywhere in a rollup, including inside Multi-Column Markdown columns (below). If the embed's target can't be found, the PDF shows `[image not found: ...]` instead of failing the whole render.

## Multi-Column Markdown

Notes using the [Multi-Column Markdown](https://github.com/ckRobinson/multi-column-markdown) community plugin's column syntax get converted to a real LaTeX `multicols` layout at export time, so the PDF shows actual side-by-side columns instead of literal `--- start-multi-column: ... ---` delimiter lines. Obsidian's own Reading view is untouched — this conversion only happens in the compiled copy handed to Pandoc, never on the source note.

Only the current (non-deprecated), `---`-delimited MCM syntax is supported, and only **Number of Columns** is read from the `column-settings` block — border, alignment, and column-width settings are ignored. Columns are separated with a hard `\columnbreak` (rather than relying on the text filling each column naturally), which fits short column content like a heading plus a single image.

## CSS snippet styling

If a note uses a `<span class="...">` with a class defined in one of your vault's **enabled** CSS snippets, the PDF picks up that class's `color`, `font-family`, `font-size`, `font-weight`, and `font-style` (mapped to the closest LaTeX equivalent — colors need to be a hex/`rgb()` value or one of a small set of basic named colors, and `font-family` needs to be installed as a system font for your PDF engine to find). Disabled snippets, and any other CSS property or selector shape, are ignored. This is a best-effort mapping for simple inline text styling, not a general CSS-to-LaTeX engine.

## Permissions & behavior

This plugin does more than the Obsidian vault API alone allows, because rendering a PDF requires it:

- **Filesystem access outside the vault API** (Node's `fs`) — to write a temporary compiled Markdown file and LaTeX header next to your notes, to resolve the vault's real on-disk path so it can hand that path to Pandoc, and to read `appearance.json` and enabled snippet files from your vault's config folder for CSS snippet styling (above). All of this stays local to your machine and your vault; nothing is uploaded anywhere.
- **Shell execution** (Node's `child_process`, via `execFile` with an argument array — never a shell string) — to invoke Pandoc and your configured PDF engine. This is the entire point of the plugin: it's a thin, typed wrapper around a `pandoc` command line.
- **Full vault enumeration** (`vault.getMarkdownFiles()` and `vault.getFiles()`) — to resolve `→ [[wikilinks]]` and `![[image embeds]]` to files, since a linked page or image can live anywhere in the vault, not just beside the note that references it.

No network requests of any kind. Desktop-only (`isDesktopOnly: true`) because Pandoc and LaTeX engines aren't available on mobile.

## License

MIT — see [LICENSE](LICENSE).
