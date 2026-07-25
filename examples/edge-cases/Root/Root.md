---
tags: [test]
---

Intro prose at the top of the root. This should appear under the document title.

## Case A — link directly under h2

> [!summary]
> This summary has LaTeX specials: 50% & $5 #hash _under_ to test escaping.
→ [[Sub/Alpha]]

## Case B — two links under one h2 (same level)

→ [[Sub/Alpha]]
→ [[Sub/Beta]]

## Case C — prose after a link triggers continued

→ [[Sub/Beta]]
This prose follows the link and must be re-anchored to Case C level.

## Case D — deeper heading after a link triggers continued
→ [[Sub/Gamma]]
#### A deeper heading that would otherwise be misattributed
deep body

## Case E — higher/equal heading after a link does NOT continue
→ [[Sub/Beta]]
## Case E2 — sibling h2 right after
plain text under E2

### Case F — link under h3 (nests to h4)
→ [[Sub/Beta]]

#### Case G — link under h4 (nests to h5)
→ [[Sub/Beta]]

##### Case H — link under h5 (nests to h6)
→ [[Sub/Beta]]

###### Case I — link under h6 (nests, capped at h6)
→ [[Sub/Beta]]

## Case J — non-expanding arrows
- → [[Sub/Alpha]] — list item, must stay plain
see inline → [[Sub/Beta]] reference, must stay plain
→ [[Sub/Alpha]] trailing text after link, must stay plain
ascii arrow -> [[Sub/Beta]] must stay plain

## Case K — alias link uses page H1 not alias
→ [[Sub/Alpha|THIS ALIAS SHOULD NOT BE THE HEADING]]

## Case L — page with no H1 (fallback to filename)
→ [[Sub/NoH1]]

## Case M — page not found
→ [[Sub/DoesNotExist]]

## Case N — self cycle
→ [[Root]]

## Case O — mutual cycle A links B links A
→ [[Sub/Cycle1]]

## Case P — bare link resolution prefers same-folder, and stale flat sibling
→ [[Beta]]

## Case Q — qualified link must hit subfolder, not flat sibling
→ [[Sub/Gamma]]

## Case R — overview callout variant + multiline
> [!overview]
> Line one of a multi-line overview.
> Line two continues it.
→ [[Sub/Alpha]]

## Case S — empty linked page
→ [[Sub/Empty]]

## Case T — heading directly above link is adopted as title
→ [[Sub/Alpha]]

## Case U — heading, summary callout, then link (adoption survives callout)
> [!summary]
> This summary sits between the heading and the link.
→ [[Sub/Beta]]

## Case V — heading, prose, then link (NOT adopted, link nests below)
Some prose first.
→ [[Sub/Beta]]

## Alpha Page
→ [[Sub/Alpha]]

## Case W — Multi-Column Markdown region becomes a multicols environment

--- start-multi-column: ID_test123

```column-settings
Number of Columns: 3
Largest Column: standard
```

#### Column One
![[Sub/pixel.png]]

--- end-column ---

#### Column Two
![[Sub/pixel.png]]

--- end-column ---

#### Column Three
![[Sub/pixel.png]]

--- end-multi-column

## Case X — image embeds resolve to real Pandoc image syntax
![[Sub/pixel.png]]
![[Sub/DoesNotExist.png]]

## Case Y — CSS snippet span styling
<span class="hanzi-line">你好</span> plain text after the span.
<span class="disabled-class">should stay unstyled</span>
