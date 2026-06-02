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
2. Inserts a heading one level below the current heading, using **that page's H1** as the title,
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

**Text after a link is re-anchored automatically.** If loose prose or a *deeper* heading follows an expanded link, the renderer re-emits the active heading with ` (continued)` so the text isn't misread as part of the expanded subsection:

```markdown
#### Heat Control
→ [[Techniques/Searing]]
more notes on heat
```

→ `#### Heat Control` / `##### Searing` / `#### Heat Control (continued)` / `more notes on heat`

A *higher-or-equal* heading after a link re-anchors on its own, so no `(continued)` is added in that case. A bare `---` or blank line never triggers it.

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
- Adds a TOC automatically when the output has `###` headings (multi-level documents)
- Guards against cycles: a link back to a page already open on the current branch renders as `*[see: PageName]*` instead of looping

---

## Depth variants

| Template | Behaviour |
|---|---|
| `rollup-renderer.md` | Full recursion (`MAX_DEPTH = Infinity`) |
| `rollup-renderer-2.md` | Two levels of expansion below the root |
| `rollup-renderer-1.md` | One level below the root; deeper links become `*[see: X]*` |

`MAX_DEPTH` is set at the top of each template. Pandoc paths and `MARGIN` live there too.

---

## Checklist

- [ ] Open the page you want as the document root
- [ ] Pages you want expanded are linked with an own-line, leading `→ [[...]]`
- [ ] Cross-links / references are in lists or inline so they stay plain text
- [ ] Summaries use `> [!summary]` callouts where wanted
- [ ] Click **Rollup to PDF** in the tab bar

The PDF saves next to the root page.

---

## Troubleshooting

**A page didn't expand:** its link isn't an own-line leading `→ [[...]]` — it's in a list, inline, or uses `->` instead of the Unicode `→`.

**A page expanded that shouldn't have:** it's an own-line `→` link; move it into a list (`- → ...`) to demote it to a plain reference.

**`[Page not found: X]`:** the path doesn't resolve. For qualified links (`Folder/Page`) the path must exist exactly; the renderer won't fall back to a same-named file elsewhere.

**`*[see: X]*` where you expected content:** X is already open higher on the current branch (a cycle), or you've hit the depth limit of a `-1`/`-2` variant.

**Heading nested too deep / too shallow:** check the nearest heading above the link — the page nests exactly one level below it.

**Pandoc error:** open Cmd+Option+I → Console for the full error. Most common cause is a special character in a filename.
