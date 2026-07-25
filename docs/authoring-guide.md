# Rollup to PDF — Authoring Guide

How to structure notes so the **Rollup to PDF** button compiles them into a single formatted PDF. Every page is parsed the same way and linked pages nest relative to your own headings, so the "index" is just normal markdown.

---

## The one rule that matters: expansion links

A linked page is pulled into the PDF **only when the link sits on its own line, with the `→` arrow as the first character:**

```markdown
→ [[Techniques/Techniques]]
```

When the renderer hits that line it:

1. Resolves the page,
2. Inserts a heading one level below the current heading — titled from **the heading directly above the link**, if there is one, or otherwise from **the linked page's filename** (pages don't carry their own H1; see the no-H1 rule below),
3. Recurses into the page (its `→` links expand too), shifting all its headings to fit.

**Any other `→` is left as plain text** — list items, inline references, cross-links:

```markdown
- → [[Recipes/Mayonnaise]] — a worked example   ← NOT expanded
see also → [[Techniques/Emulsification]]          ← NOT expanded
```

So: **own-line, leading `→` = expand. Anything else = plain reference.** If you want a standalone link *not* to expand, put it in a list (`- → ...`).

---

## How nesting works

A link renders one level below the nearest heading above it. Your own headings pass through unchanged.

```markdown
## Techniques
### Foundations
#### Heat Control
→ [[Techniques/Searing]]
```

→ `Searing` renders as `#####` (one below `####`).

```markdown
## Techniques
→ [[Techniques/Searing]]
## Recipes
```

→ `Searing` renders as `###` (one below `##`); `Recipes` stays `##`.

**Multiple links under one heading sit at the same level:**

```markdown
### Knife Work
→ [[Techniques/Julienne]]
→ [[Techniques/Brunoise]]
```

→ both render as `####`, side by side.

**How titles work (heading reuse).** When a `→` link sits under a heading (blank lines, a `> [!summary]` callout, or intro prose between them is fine), that heading *is* the section's title. The linked page's content nests one level below it, and the linked page's own H1 (if any) is dropped. So each level of your index contributes exactly one heading:

```markdown
## USA
> [!summary]
> ...
→ [[USA/USA]]
```

gives `## USA`, then everything inside `USA.md` nested below it. You do **not** need the heading text to match the linked page's title — name the heading whatever reads best. This is what keeps deep rollups (Politics → USA → Covert Operations → Operation → Section) clean, with one heading level per hop and no duplicated titles.

If a link is **not** under a fresh heading — a bare list of sibling links, or a link after a paragraph of prose — there's no heading to reuse, so the linked page is titled from its **filename**. That's how a page that's just a list of `→` links (e.g. a list of operations) gives each linked page its own titled section.

**Prose between a heading and its link stays as the chapter intro.** It does not break heading reuse:

```markdown
## Covert Operations
Documented programmes and false flags. Each has its own note below.
→ [[Covert Ops/Covert Ops]]
```

→ `## Covert Operations`, then the intro line, then the linked page nested below. A new heading after an expanded link simply renders at its own level (there is no `(continued)` re-anchor).

---

## Summaries / Overview boxes

Mark a summary with an Obsidian callout anywhere you want one. Both `[!summary]` and `[!overview]` produce the grey **Overview** box in the PDF:

```markdown
### Techniques
> [!summary]
> Foundational methods that recur across recipes. Master these first
> and most recipes become variations on a theme.
→ [[Techniques/Techniques]]
```

Plain `>` blockquotes are left as ordinary blockquotes — only `[!summary]`/`[!overview]` callouts become the coloured box.

---

## Folder structure

The renderer resolves wikilinks the way Obsidian does, but **path-qualified links resolve strictly by path**, which avoids picking up a same-named file elsewhere:

```
Cookbook/
  Cookbook.md             ← run Rollup to PDF from here
  Techniques/
    Techniques.md         ← sub-index (has its own → links)
    Knife Skills.md       ← leaf
    Emulsification.md     ← leaf
  Recipes/
    Recipes.md            ← sub-index
    Mayonnaise.md         ← leaf
```

- A link written as `→ [[Techniques/Techniques]]` will **only** match `Techniques/Techniques.md` relative to the current page or by that exact path suffix. It will **not** fall back to a flat `Techniques.md` sibling elsewhere. (A bare `→ [[Techniques]]` still resolves loosely, preferring a file in the same folder.)
- Stale flat files are no longer silently picked up for qualified links — but deleting them is still tidier.

---

## Automatic behaviour

The renderer always:

- Strips YAML frontmatter
- Strips `← [[...]]` back-navigation lines
- Drops each page's own H1 (its title is supplied by the parent link, or by the document title for the root page)
- Shifts all headings to fit their position in the tree (capped at h6)
- Converts `[[wikilinks]]` to plain text
- Resolves `![[image.jpg]]` embeds to the real image, wherever it lives in the vault
- Converts Multi-Column Markdown regions (`--- start-multi-column: ... --- end-multi-column`) into real side-by-side LaTeX columns
- Applies matching span styling (color/font/size) from your vault's enabled CSS snippets to `<span class="...">` runs
- Adds a TOC automatically when the output has `###` headings (multi-level documents)
- Guards against cycles: a link back to a page already open on the current branch renders as `*[see: PageName]*` instead of looping

---

## Depth variants

| Command | Behaviour |
|---|---|
| Render rollup to PDF (full recursion) | Full recursion (no depth cap) |
| Render rollup to PDF (max 2 levels deep) | Two levels of expansion below the root |
| Render rollup to PDF (max 1 level deep) | One level below the root; deeper links become `*[see: X]*` |

Pandoc path, PDF engine path, CJK font, and page margin are configured once in
**Settings → Rollup to PDF**, not per command.

---

## Checklist

- [ ] Open the page you want as the document root
- [ ] Pages you want expanded are linked with an own-line, leading `→ [[...]]`
- [ ] Cross-links / references are in lists or inline so they stay plain text
- [ ] Summaries use `> [!summary]` callouts where wanted
- [ ] Run **Render rollup to PDF** from the command palette (Cmd/Ctrl+P)

The PDF saves next to the root page.

---

## Troubleshooting

**A page didn't expand:** its link isn't an own-line leading `→ [[...]]` — it's in a list, inline, or uses `->` instead of the Unicode `→`.

**A page expanded that shouldn't have:** it's an own-line `→` link; move it into a list (`- → ...`) to demote it to a plain reference.

**`[Page not found: X]`:** the path doesn't resolve. For qualified links (`Folder/Page`) the path must exist exactly; the renderer won't fall back to a same-named file elsewhere.

**`*[see: X]*` where you expected content:** X is already open higher on the current branch (a cycle), or you've hit the depth limit of a `-1`/`-2` variant.

**Heading nested too deep / too shallow:** check the nearest heading above the link — the page nests exactly one level below it.

**Pandoc error:** the notice shows Pandoc's error message directly; open Cmd+Option+I → Console for the full stderr output. Most common cause is a special character in a filename, or the Pandoc/PDF engine path in **Settings → Rollup to PDF** not matching your system.
