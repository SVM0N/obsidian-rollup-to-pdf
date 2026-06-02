// ============================================================
// test/edge-cases.test.js
// Exercises every edge case by rendering examples/edge-cases
// through the logic extracted from templates/rollup-renderer.md.
// No duplicated renderer — the template is the source of truth.
// ============================================================

const path = require("path");
const { render, loadRenderer } = require("./harness.js");

const TEMPLATE = path.join(__dirname, "..", "templates", "rollup-renderer.md");
const EXAMPLES = path.join(__dirname, "..", "examples");
const EDGE = path.join(EXAMPLES, "edge-cases");

let pass = 0, fail = 0;
const ck = (name, cond) => cond ? pass++ : (fail++, console.log("FAIL: " + name));

(async () => {
    // ---- pure-function checks (extracted from the template) ----
    const R = await loadRenderer(TEMPLATE, EDGE, "Root");

    // Render the whole edge vault.
    const { compiled } = await render(TEMPLATE, EDGE, "Root", "Root.md");
    const has = (re) => re.test(compiled);

    // A: link under h2 -> h3; summary boxed + LaTeX-escaped
    ck("A link under h2 -> ### Alpha Page", has(/\n### Alpha Page\n/));
    ck("A summary boxed", has(/tcolorbox[\s\S]*?LaTeX specials/));
    ck("A LaTeX escapes", has(/50\\% \\& \\\$5 \\#hash/));
    ck("A underscore escaped", has(/\\_under\\_/));

    // B: two links under one h2 -> both ###, no continued between
    {
        const seg = compiled.split("Case B")[1].split("## Case C")[0];
        ck("B Alpha ###", /\n### Alpha Page\n/.test(seg));
        ck("B Beta ###", /\n### Beta Page \(subfolder\)\n/.test(seg));
        ck("B no continued between links", !/\(continued\)/.test(seg));
    }

    // C: prose after link -> continued
    ck("C continued", has(/## Case C — prose after a link triggers continued \(continued\)/));
    ck("C prose present", has(/This prose follows the link and must be re-anchored/));

    // D: deeper heading after link -> continued precedes it
    ck("D continued", has(/## Case D — deeper heading after a link triggers continued \(continued\)/));
    {
        const ci = compiled.indexOf("Case D — deeper heading after a link triggers continued (continued)");
        const di = compiled.indexOf("A deeper heading that would otherwise");
        ck("D continued precedes deeper heading", ci !== -1 && di !== -1 && ci < di);
    }

    // E: higher/equal heading after link -> no continued
    {
        const seg = compiled.split("higher/equal heading after a link does NOT continue")[1].split("Case F")[0];
        ck("E no continued before sibling h2", !/\(continued\)/.test(seg));
        ck("E2 sibling present", /Case E2/.test(seg));
    }

    // F/G/H/I: nesting math + h6 cap
    ck("F h3 link -> #### Beta", has(/#### Beta Page \(subfolder\)/));
    ck("G h4 link -> ##### Beta", has(/##### Beta Page \(subfolder\)/));
    ck("H h5 link -> ###### Beta", has(/###### Beta Page \(subfolder\)/));
    ck("I h6 cap: no #######", !has(/#######/));

    // J: non-expanding arrows stay plain
    {
        const seg = compiled.split("Case J")[1].split("## Case K")[0];
        ck("J list-item arrow plain", /- → /.test(seg));
        ck("J inline arrow plain", /see inline → /.test(seg));
        ck("J trailing-text arrow plain", /trailing text after link/.test(seg));
        ck("J ascii arrow plain", /ascii arrow -> /.test(seg));
        ck("J no expansion inside Case J", !/### Alpha Page/.test(seg));
    }

    // K: alias uses page H1, not alias text
    ck("K page H1 not alias", has(/Alpha Page/) && !has(/THIS ALIAS SHOULD NOT BE THE HEADING/));

    // L: no-H1 page -> filename fallback
    ck("L filename fallback", has(/### NoH1\n/));

    // M: not found
    ck("M not-found marker", has(/\[Page not found: Sub\/DoesNotExist\]/));

    // N/O: cycles
    ck("N self-cycle see-ref", has(/\*\[see: Root\]\*/));
    ck("O mutual cycle terminates", has(/Cycle One/) && has(/Cycle Two/) && has(/\*\[see: Sub\/Cycle1\]\*/));

    // P/Q: resolution
    ck("P bare link -> same-folder flat sibling", has(/Beta FLAT \(stale sibling\)/));
    ck("Q qualified link recurses into Delta", has(/Delta Page \(deep\)/));
    ck("Q Delta h6 stays capped", !has(/#######/));

    // blockquote vs callout
    ck("plain blockquote preserved", has(/> a plain pull-quote/));

    // R/S: overview variant + multiline + empty
    ck("R overview boxed", has(/tcolorbox[\s\S]*?Line one of a multi-line overview/));
    ck("R multiline joined", has(/Line one of a multi-line overview\. Line two continues it\./));
    ck("S empty page heading", has(/### Empty\n/));

    // ---- depth-cap behaviour via MAX_DEPTH ----
    {
        const deep = await render(TEMPLATE, EDGE, "Root", "Root.md", 1);
        // At depth 1, Gamma expands but its child Delta must NOT (becomes see-ref)
        ck("depth=1 expands first level (Gamma)", /Gamma Page/.test(deep.compiled));
        ck("depth=1 stops before Delta", !/Delta Page \(deep\)/.test(deep.compiled));
        ck("depth=1 leaves see-ref for capped link", /\*\[see: Deep\/Delta\]\*/.test(deep.compiled));
    }

    console.log(`\nedge-cases: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
