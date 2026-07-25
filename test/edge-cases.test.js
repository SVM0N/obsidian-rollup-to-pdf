// ============================================================
// test/edge-cases.test.js
// Exercises every edge case by rendering examples/edge-cases
// through the logic extracted from templates/rollup-renderer.md.
// No duplicated renderer — the template is the source of truth.
// ============================================================

const path = require("path");
const { render } = require("./harness.js");

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
        const seg = compiled.split("## Case Y")[1] || "";
        ck("Y styled span wrapped in raw LaTeX with mapped color/font", /`\{[^`]*\\textcolor\[HTML\]\{C0392B\}`\{=latex\}你好`\}`\{=latex\}/.test(seg));
        ck("Y styled span carries font-family and font-size", /\\fontspec\{Noto Sans SC\}/.test(seg) && /\\fontsize\{10\.5\}/.test(seg));
        ck("Y plain text after styled span untouched", /plain text after the span/.test(seg));
        ck("Y disabled snippet's class left unstyled", /<span class="disabled-class">should stay unstyled<\/span>/.test(seg));
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
