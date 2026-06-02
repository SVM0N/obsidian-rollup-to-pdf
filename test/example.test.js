// ============================================================
// test/example.test.js
// Smoke test: the Cookbook example vault compiles cleanly and
// nests as documented. Doubles as a check that the example in
// the README actually works.
// ============================================================

const path = require("path");
const { render } = require("./harness.js");

const TEMPLATE = path.join(__dirname, "..", "templates", "rollup-renderer.md");
const EXAMPLES = path.join(__dirname, "..", "examples");

let pass = 0, fail = 0;
const ck = (name, cond) => cond ? pass++ : (fail++, console.log("FAIL: " + name));

(async () => {
    const { compiled } = await render(TEMPLATE, EXAMPLES, "Cookbook", "Cookbook.md");
    const has = (re) => re.test(compiled);

    ck("document title", has(/^# Cookbook\n/));
    ck("Techniques nests at ###", has(/\n### Techniques\n/));
    ck("summary callout boxed", has(/tcolorbox[\s\S]*?Foundational methods/));
    ck("overview callout boxed", has(/tcolorbox[\s\S]*?Worked examples/));
    ck("Knife Skills expands one level below Techniques (####)", has(/#### Knife Skills/));
    ck("Emulsification expands (####)", has(/#### Emulsification/));
    ck("Recipes section present", has(/\n### Recipes\n/));
    ck("Mayonnaise expands under Recipes", has(/#### Mayonnaise/));
    ck("cross-link to Emulsification stays plain (not re-expanded loop)",
        has(/see → Techniques\/Emulsification/));
    ck("plain blockquote preserved", has(/> a vinaigrette is just a temporary emulsion/));
    ck("no page-not-found", !has(/Page not found/));
    ck("no raw wikilinks leaked", !has(/\[\[/));

    console.log(`\nexample: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
