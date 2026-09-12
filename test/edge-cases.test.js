// ============================================================
// test/edge-cases.test.js
// Exercises every edge case by rendering examples/edge-cases
// through the logic extracted from templates/rollup-renderer.md.
// No duplicated renderer — the template is the source of truth.
// ============================================================

const path = require("path");
const { render, loadCore } = require("./harness.js");

const EXAMPLES = path.join(__dirname, "..", "examples");
const EDGE = path.join(EXAMPLES, "edge-cases");

let pass = 0, fail = 0;
const ck = (name, cond) => cond ? pass++ : (fail++, console.log("FAIL: " + name));

(async () => {
    // Render the whole edge vault.
    const { compiled } = await render(EDGE, "Root", "Root.md");
    const has = (re) => re.test(compiled);

    // A: link under h2 -> h3; summary boxed + LaTeX-escaped
    // A: link under h2 adopts the Case A heading (see block below)
    // A: link under h2 reuses the Case A heading; Alpha sections nest at ###
    {
        const seg = compiled.split("## Case A")[1].split("\n## Case B")[0];
        ck("A Alpha sections nest at ### (heading reused)", /### Alpha Section One/.test(seg));
        ck("A no separate Alpha title", !/### Alpha Page/.test(seg) && !/#### Alpha/.test(seg));
    }
    ck("A summary boxed", has(/tcolorbox[\s\S]*?LaTeX specials/));
    ck("A LaTeX escapes", has(/50\\% \\& \\\$5 \\#hash/));
    ck("A underscore escaped", has(/\\_under\\_/));

    // B: two links under one h2. First reuses the heading (Alpha sections at
    // ###); second comes after content so it gets its own filename title.
    {
        const seg = compiled.split("## Case B")[1].split("\n## Case C")[0];
        ck("B first link reuses heading (Alpha ### sections)", /### Alpha Section One/.test(seg));
        ck("B second link titled (### Beta)", /### Beta\b/.test(seg));
    }

    // C: prose after link -> continued
    ck("C continued", has(/## Case C — prose after a link triggers continued \(continued\)/));
    ck("C prose present", has(/This prose follows the link and must be re-anchored/));

    // D: a deeper heading after a link renders at its own level (no continued
    // re-anchor; headings self-anchor).
    {
        const seg = compiled.split("## Case D")[1].split("\n## Case E")[0];
        ck("D no (continued) artifact", !/\(continued\)/.test(seg));
        ck("D deeper heading present", /A deeper heading that would otherwise/.test(seg));
    }

    // E: higher/equal heading after link -> no continued
    {
        const seg = compiled.split("higher/equal heading after a link does NOT continue")[1].split("Case F")[0];
        ck("E no continued before sibling h2", !/\(continued\)/.test(seg));
        ck("E2 sibling present", /Case E2/.test(seg));
    }

    // F/G/H/I: nesting math under adoption. Beta's H1 adopts the case heading
    // level; Beta's own "### deep heading" then nests two below that (its h3
    // shifted to sit under the adopted h1 slot). h6 cap still holds.
    // Case F heading is ###(h3) -> Beta deep heading at #####(h5)
    ck("F adopt under h3 -> Beta deep heading #####", has(/##### Beta deep heading/));
    // Case G heading is ####(h4) -> ######(h6); Case H #####(h5) -> ######(cap)
    ck("G/H adopt deeper -> Beta deep heading ###### present", has(/###### Beta deep heading/));
    ck("I h6 cap: no #######", !has(/#######/));

    // J: non-expanding arrows stay plain
    {
        const seg = compiled.split("Case J")[1].split("## Case K")[0];
        ck("J list-item arrow plain", /- → /.test(seg));
        ck("J inline arrow plain", /see inline → /.test(seg));
        ck("J trailing-text arrow plain", /trailing text after link/.test(seg));
        ck("J ascii arrow plain", /ascii arrow -> /.test(seg));
        ck("J no expansion inside Case J", !/### Alpha Section One/.test(seg));
    }

    // K: alias link is adopted under the Case K heading; alias text never used
    //    as a heading, and Alpha's H1 isn't emitted as a title either.
    ck("K alias not used as heading", !has(/THIS ALIAS SHOULD NOT BE THE HEADING/));

    // L: no-H1 page adopted -> its ## section nests one below Case L (###)
    ck("L no-H1 page adopted", has(/### A section in a page lacking H1/));

    // M: not found
    ck("M not-found marker", has(/\[Page not found: Sub\/DoesNotExist\]/));

    // N/O: cycles
    ck("N self-cycle see-ref", has(/\*\[see: Root\]\*/));
    ck("O mutual cycle terminates", has(/Cycle2/) && has(/\*\[see: Sub\/Cycle1\]\*/));

    // P/Q: resolution (titles are adopted/dropped, so assert on body text)
    ck("P bare link -> same-folder flat sibling", has(/This is the WRONG Beta/));
    ck("Q qualified link recurses into Delta", has(/Delta is two expansions deep/));
    ck("Q Delta h6 stays capped", !has(/#######/));

    // blockquote vs callout
    ck("plain blockquote preserved", has(/> a plain pull-quote/));

    // R/S: overview variant + multiline + empty
    ck("R overview boxed", has(/tcolorbox[\s\S]*?Line one of a multi-line overview/));
    ck("R multiline joined", has(/Line one of a multi-line overview\. Line two continues it\./));
    ck("S empty page no crash", has(/Case S — empty linked page/));

    // T: heading text == linked page H1 -> dedupe (single heading, content nests below)
    {
        // "## Alpha Page" + link to Alpha (H1 "Alpha Page"): the page title is
        // dropped, Alpha's sections nest directly under the existing heading.
        const seg = compiled.split("## Alpha Page")[1] || "";
        ck("dedupe: no doubled Alpha Page heading", (compiled.match(/Alpha Page/g) || []).length >= 1);
        // After the "## Alpha Page" heading, the next heading should be Alpha's
        // section at ### (one below), NOT a repeated "### Alpha Page".
        ck("dedupe: Alpha sections nest at ###", /### Alpha Section One/.test(seg));
        ck("dedupe: no '### Alpha Page' title repeat", !/### Alpha Page/.test(seg));
    }

    // W: Multi-Column Markdown region -> LaTeX multicols environment
    {
        const seg = compiled.split("## Case W")[1].split("## Case X")[0];
        ck("W begin multicols with parsed column count", /\\begin\{multicols\}\{3\}/.test(seg));
        ck("W end multicols present", /\\end\{multicols\}/.test(seg));
        ck("W two columnbreaks for 3 columns", (seg.match(/\\columnbreak/g) || []).length === 2);
        ck("W column headings pass through unchanged", /#### Column One/.test(seg) && /#### Column Two/.test(seg) && /#### Column Three/.test(seg));
        ck("W no raw MCM delimiters leak through", !/start-multi-column/.test(seg) && !/end-multi-column/.test(seg) && !/end-column/.test(seg));
        ck("W column-settings fence discarded", !/column-settings/.test(seg));
        ck("W images inside columns resolved to Pandoc syntax", /!\[\]\(<[^>]*pixel\.png>\)/.test(seg));
        ck("W no raw ![[ embeds leak through", !/!\[\[/.test(seg));
    }

    // X: image embeds resolve to real Pandoc image syntax; missing embed -> marker
    {
        const seg = compiled.split("## Case X")[1].split("## Case Y")[0];
        ck("X image resolved to absolute path", /!\[\]\(<[^>]*Sub[/\\]pixel\.png>\)/.test(seg));
        ck("X missing image gets an error marker, not a crash", /\[image not found: Sub\/DoesNotExist\.png\]/.test(seg));
    }

    // Y: CSS-snippet span styling — enabled class gets a LaTeX wrapper,
    // disabled snippet's class is left unstyled.
    {
        const seg = (compiled.split("## Case Y")[1] || "").split("## Case Z")[0];
        ck("Y styled span wrapped in raw LaTeX with mapped color/font", /`\{[^`]*\\textcolor\[HTML\]\{C0392B\}`\{=latex\}你好`\}`\{=latex\}/.test(seg));
        ck("Y styled span carries font-family and font-size", /\\fontspec\{Noto Sans SC\}/.test(seg) && /\\fontsize\{10\.5\}/.test(seg));
        ck("Y plain text after styled span untouched", /plain text after the span/.test(seg));
        ck("Y disabled snippet's class left unstyled", /<span class="disabled-class">should stay unstyled<\/span>/.test(seg));
    }

    // Z: Obsidian-legal tables (no blank line around them) are re-separated so
    // Pandoc sees a table; image embeds carry their size hint and survive the
    // "\\|" escaping Obsidian requires inside a table cell.
    {
        const seg = (compiled.split("## Case Z")[1] || "").split("## Case AA")[0];
        const lines = seg.split("\n");
        const delim = lines.findIndex((l) => /^\|---\|/.test(l));
        ck("Z blank line inserted before the table header", lines[delim - 2].trim() === "");
        ck("Z table header still directly above the delimiter", /^\| Attachment \|/.test(lines[delim - 1]));
        ck("Z blank line inserted after the last table row", lines[delim + 3].trim() === "");
        ck("Z prose after the table survives", /Trailing prose with no blank line after the table\./.test(seg));
        ck("Z table after a list item is separated too", /- a list item\n\n\| C \| D \|/.test(seg));
        ck("Z pipe table inside a code fence is left alone", /```\n\| not \| a \| table \|\n\|---\|---\|---\|\n```/.test(seg));
        ck("Z escaped-pipe embed in a cell resolves with its width", /!\[\]\(<[^>]*pixel\.png>\)\{width=240px\}/.test(seg));
        ck("Z no mangled embed remnant in the cell", !/!240/.test(seg));
        ck("Z width x height hint becomes both attributes", /\{width=120px height=60px\}/.test(seg));
        ck("Z non-numeric alias stays alt text, not a size", /!\[A pixel, greatly enlarged\]\(<[^>]*pixel\.png>\)$/m.test(seg));
        ck("Z LaTeX-unrenderable format degrades to a marker", /\[image format not supported by LaTeX: photo\.webp\]/.test(seg));
        ck("Z consecutive image embeds each get their own block", /\{width=120px height=60px\}\n\n!\[A pixel, greatly enlarged\]/.test(seg));
        ck("Z no raw ![[ embeds leak through", !/!\[\[/.test(seg));
    }

    // AA: the shape a real vocabulary note takes — a bold line, then straight
    // into a table whose whole header row is image embeds.
    {
        const seg = (compiled.split("## Case AA")[1] || "").split("## Case AB")[0];
        const lines = seg.split("\n");
        const delim = lines.findIndex((l) => /^\| -+ \|/.test(l));
        ck("AA bold line separated from the table it precedes", lines[delim - 2].trim() === "" && /3rd tone/.test(lines[delim - 3]));
        ck("AA all four header cells resolved to images", (lines[delim - 1].match(/!\[\]\(<[^>]*pixel\.png>\)/g) || []).length === 4);
        ck("AA header row stays a single line", lines[delim - 1].split("|").length === 6);
        ck("AA image-isolation left the header row alone", !/^!\[\]\(</m.test(lines[delim - 1]));
        ck("AA CJK body rows pass through intact", /\| 手机 +\| 手镯 +\| 手表 +\| 手套 +\|/.test(seg));
        ck("AA pinyin diacritics survive", /shǒu zhuó/.test(seg));
        ck("AA no raw ![[ embeds leak through", !/!\[\[/.test(seg));
    }

    // AB: a csv-view table is spliced into the page as fresh Markdown, so the
    // embeds and CJK text inside the CSV have to go through the same rewrites
    // as anything typed in the note. Expanding the CSV after image resolution
    // (the old order) left those cells as bare "!name.png" text.
    {
        const seg = (compiled.split("## Case AB")[1] || "").split("## Case AC")[0];
        ck("AB csv rows resolved to real images", (seg.match(/!\[\]\(<[^>]*pixel\.png>\)/g) || []).length === 2);
        ck("AB csv cell size hint survives mdTable's pipe escaping", /!\[\]\(<[^>]*pixel\.png>\)\{width=80px\}/.test(seg));
        ck("AB no mangled embed remnant from the csv", !/!80/.test(seg) && !/!Sub\/pixel/.test(seg));
        ck("AB CJK from the csv passes through", /\| 听 \| tīng \|/.test(seg) && /\| 飞机 \| fēijī \|/.test(seg));
        ck("AB no raw ![[ embeds leak through", !/!\[\[/.test(seg));
    }

    // AC/AD: `columns:` is an ordered allowlist, `hide:` a denylist over what
    // it leaves. The csv-inline fence is the same block type as csv-view as far
    // as a PDF is concerned, so both names expand.
    {
        const seg = (compiled.split("## Case AC")[1] || "").split("## Case AD")[0];
        ck("AC csv-inline fence expands like csv-view", !/```[ \t]*csv-/.test(seg) && /\| Image \| Character \|/.test(seg));
        ck("AC columns: honours the order written, not the file's", /\| Image \| Character \|/.test(seg));
        ck("AC columns: drops everything unlisted", !/Pinyin|Translation|drill this one/.test(seg));
        ck("AC selected image column still resolves", /!\[\]\(<[^>]*pixel\.png>\)\{width=80px\}/.test(seg));
    }
    {
        const seg = compiled.split("## Case AD")[1] || "";
        ck("AD hide: removes the named columns", !/Notes|Translation|compound word/.test(seg));
        ck("AD hide: keeps the rest in file order", /\| Character \| Pinyin \| Image \|/.test(seg));
        ck("AD CJK rows survive the column filter", /\| 听 \| tīng \|/.test(seg) && /\| 飞机 \| fēijī \|/.test(seg));
        ck("AD no raw ![[ embeds leak through", !/!\[\[/.test(seg));
    }

    // ---- CJK detection gates the font Pandoc is told about ----
    // Naming a CJK font aborts the whole run if fontspec can't resolve it, so
    // it is only passed for documents that actually contain CJK text. A false
    // positive here would break Latin-only exports that have nothing to do
    // with the feature.
    {
        const { hasCjkText } = loadCore();
        const yes = ["\u542c t\u012bng", "\u3072\u3089\u304c\u306a", "\u30ab\u30bf\u30ab\u30ca", "\ud55c\uae00", "\u4e2d\u6587\u3001\u6807\u70b9", "\uff46\uff55\uff4c\uff4c", "\u{20000} ext-B"];
        const no = ["", "Plain English only.", "Caf\u00e9 na\u00efve \u2014 em dash, \u00b0 and \u00bd", "pinyin only: sh\u01d2u j\u012b", "| A | B |\n|---|---|"];
        ck("CJK detected for hanzi, kana, hangul, fullwidth and ext-B", yes.every(hasCjkText));
        ck("CJK not claimed for Latin, accents or pinyin diacritics", no.every((s) => !hasCjkText(s)));
    }

    // ---- depth-cap behaviour via MAX_DEPTH ----
    {
        const deep = await render(EDGE, "Root", "Root.md", 1);
        ck("depth=1 expands first level (Gamma)", /Gamma child/.test(deep.compiled));
        ck("depth=1 stops before Delta", !/Delta is two expansions deep/.test(deep.compiled));
        ck("depth=1 leaves see-ref for capped link", /\*\[see: Deep\/Delta\]\*/.test(deep.compiled));
    }

    console.log(`\nedge-cases: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
