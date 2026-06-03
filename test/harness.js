// ============================================================
// harness.js — load the renderer logic from the TEMPLATE itself
// ------------------------------------------------------------
// The Templater template (templates/rollup-renderer.md) is the
// single source of truth. This harness extracts the pure JS
// between the "const CALLOUT_RE" declaration and the "// ── Build"
// section, stubs the Obsidian API with a filesystem-backed fake,
// and returns the live { walk, pageTitle, resolveFile } so tests
// exercise the exact code that ships — never a copy.
// ============================================================

const fs = require("fs");
const path = require("path");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Build a filesystem-backed fake of the Obsidian `app.vault` API,
// rooted at `vaultDir`, exposing markdown files under `rootRel`.
function makeApp(vaultDir, rootRel) {
    const files = [];
    (function rec(d) {
        for (const e of fs.readdirSync(path.join(vaultDir, d), { withFileTypes: true })) {
            const rel = path.join(d, e.name);
            if (e.isDirectory()) rec(rel);
            else if (e.name.endsWith(".md")) {
                const p = rel.replace(/\\/g, "/");
                files.push({ path: p, _read: () => fs.readFileSync(path.join(vaultDir, p), "utf8") });
            }
        }
    })(rootRel);
    return {
        vault: {
            getMarkdownFiles: () => files,
            read: async (f) => f._read(),
            adapter: { basePath: vaultDir },
        },
    };
}

// Extract the renderer logic from a template file and return its
// functions, wired to a fake app for the given vault.
async function loadRenderer(templatePath, vaultDir, rootRel, maxDepth = Infinity) {
    let src = fs.readFileSync(templatePath, "utf8")
        .replace(/^<%\*/, "")
        .replace(/%>\s*$/, "");
    const start = src.indexOf("const CALLOUT_RE");
    const end = src.indexOf("// ── Build");
    if (start === -1 || end === -1) {
        throw new Error("Could not find extraction markers in " + templatePath);
    }
    src = `const MAX_DEPTH = ${maxDepth === Infinity ? "Infinity" : maxDepth};\n` + src.slice(start, end);

    global.app = makeApp(vaultDir, rootRel);
    const factory = new AsyncFunction("path", src + "\n;return { walk, pageTitle, resolveFile };");
    return factory(path);
}

// Convenience: render a whole document from a root page.
async function render(templatePath, vaultDir, rootRel, rootFile, maxDepth = Infinity) {
    const R = await loadRenderer(templatePath, vaultDir, rootRel, maxDepth);
    const root = fs.readFileSync(path.join(vaultDir, rootRel, rootFile), "utf8");
    const title = rootFile.replace(/\.md$/, "");
    const body = await R.walk(root, 2, rootRel, new Set([rootRel + "/" + rootFile]), 0);
    return { compiled: `# ${title}\n${body}\n`, R, title };
}

module.exports = { loadRenderer, render, makeApp };
