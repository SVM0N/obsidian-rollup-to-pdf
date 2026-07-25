// ============================================================
// harness.js — exercise the real plugin core, not a copy
// ------------------------------------------------------------
// src/walker.ts (plus its local dependencies text-utils.ts,
// csv-view.ts, resolve-file.ts, multi-column.ts, embeds.ts,
// css-snippets.ts) is the single source of truth for rendering.
// This harness bundles that TypeScript straight from src/ with
// esbuild, stubs the Obsidian API with a filesystem-backed fake,
// and returns the live { walkInline, walkAppendix,
// loadSnippetSpanStyles } so tests exercise the exact code that
// ships in main.js — never a duplicate.
// ============================================================

const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

let cachedCore = null;

// Bundle a src/*.ts entry point to CommonJS. The only import from
// "obsidian" anywhere in these files is `import type { ... }`, which
// esbuild elides, so no real "obsidian" package is needed at test time.
function bundle(entryRel) {
	const entry = path.join(__dirname, "..", "src", entryRel);
	const result = esbuild.buildSync({
		entryPoints: [entry],
		bundle: true,
		platform: "node",
		format: "cjs",
		write: false,
	});
	const code = result.outputFiles[0].text;
	const tmpFile = path.join(os.tmpdir(), `rollup-core-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`);
	fs.writeFileSync(tmpFile, code);
	try {
		return require(tmpFile);
	} finally {
		fs.unlinkSync(tmpFile);
	}
}

function loadCore() {
	if (cachedCore) return cachedCore;
	cachedCore = { ...bundle("walker.ts"), ...bundle("css-snippets.ts") };
	return cachedCore;
}

// Build a filesystem-backed fake of the Obsidian `app.vault` API, rooted at
// `vaultDir`, exposing markdown/CSV files (readable) and all other files
// (for image-embed resolution) under `rootRel`.
function makeApp(vaultDir, rootRel) {
	const files = [];
	(function rec(d) {
		for (const e of fs.readdirSync(path.join(vaultDir, d), { withFileTypes: true })) {
			if (e.name === ".obsidian") continue;
			const rel = path.join(d, e.name);
			if (e.isDirectory()) rec(rel);
			else {
				const p = rel.replace(/\\/g, "/");
				files.push({ path: p, _read: () => fs.readFileSync(path.join(vaultDir, p), "utf8") });
			}
		}
	})(rootRel);
	const mdFiles = files.filter((f) => f.path.endsWith(".md"));
	return {
		vault: {
			configDir: ".obsidian",
			getMarkdownFiles: () => mdFiles,
			getFiles: () => files,
			read: async (f) => f._read(),
			getAbstractFileByPath: (p) => files.find((f) => f.path === p) || null,
		},
	};
}

// Convenience: render a whole document (inline-expansion mode) from a root page.
async function render(vaultDir, rootRel, rootFile, maxDepth = Infinity) {
	const { walkInline, loadSnippetSpanStyles } = loadCore();
	const app = makeApp(vaultDir, rootRel);
	const rootPath = (rootRel + "/" + rootFile).replace(/\\/g, "/");
	const root = fs.readFileSync(path.join(vaultDir, rootRel, rootFile), "utf8");
	const title = rootFile.replace(/\.md$/, "");
	const ctx = { vaultPath: vaultDir, spanStyles: loadSnippetSpanStyles(app, vaultDir) };
	const body = await walkInline(app, root, 2, rootRel, new Set([rootPath]), 0, maxDepth, ctx);
	return { compiled: `# ${title}\n${body}\n`, title };
}

module.exports = { render, makeApp, loadCore };
