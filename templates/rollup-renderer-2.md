<%*
// ============================================================
// ROLLUP RENDERER v2 — unified walker, heading-relative nesting
// ------------------------------------------------------------
// Every page is parsed identically (no index/leaf distinction).
// Walk top to bottom tracking the current heading level. A
// line-leading "→ [[Page]]" expands that page inline at
// currentLevel+1, using the page's H1 as the heading, then
// recurses. Any other "→" (list item, inline) stays plain text.
//
// • Headings in a page pass through, shifted to fit their slot.
// • Multiple links under one heading sit at the same level.
// • Loose content / a deeper heading after a link re-anchors
//   with "<Heading> (continued)"; a higher heading or rule does not.
// • "> [!summary]" / "> [!overview]" → Overview box; plain "> "
//   blockquotes pass through unchanged.
// • Cycles render as "*[see: X]*".
//
// Depth: set MAX_DEPTH below. Infinity = full recursion.
//   variant -2 → MAX_DEPTH = 2 ; variant -1 → MAX_DEPTH = 1
// ============================================================

const fs   = require("fs");
const path = require("path");
const { exec } = require("child_process");

// ── Config ───────────────────────────────────────────────────
const PANDOC      = "/opt/homebrew/bin/pandoc";
const PDF_ENGINE  = "/usr/local/bin/pdflatex";
const MARGIN      = "2cm";
const MAX_DEPTH   = 2;   // variant: max 2 level(s) of recursion below the root
// ─────────────────────────────────────────────────────────────

const vaultPath    = app.vault.adapter.basePath;
const activeFile   = tp.file.find_tfile(tp.file.title);
const indexContent = await app.vault.read(activeFile);
const indexDir     = path.dirname(activeFile.path);
const OUTPUT_DIR   = path.join(vaultPath, indexDir);
const indexTitle   = tp.file.title;

const LATEX_HEADER = `\\usepackage{tcolorbox}
\\tcbuselibrary{skins}
`;

const CALLOUT_RE = /^>\s*\[!(summary|overview)\]/i;

// ── String helpers ───────────────────────────────────────────
function stripFrontmatter(s) { return s.replace(/^---[\s\S]*?\n---\n/, "").trim(); }
function stripBacklinks(s)   { return s.replace(/^←.*\[\[.*\]\].*$/gm, ""); }
function stripWikilinks(s) {
    return s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
            .replace(/\[\[([^\]]+)\]\]/g, "$1");
}
function pageTitle(content, fallback) {
    const m = content.match(/^# (.+)$/m);
    return m ? stripWikilinks(m[1]).trim() : fallback;
}
function expansionTarget(line) {
    const m = line.match(/^→\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/);
    return m ? m[1].trim() : null;
}
function shiftHeadingLine(line, offset) {
    return line.replace(/^(#{1,6})(\s)/, (_, h, sp) =>
        "#".repeat(Math.min(h.length + offset, 6)) + sp);
}
function calloutBox(bodyLines) {
    const text = bodyLines.join(" ").trim();
    const escaped = text.replace(/\\/g, "\\textbackslash{}")
                        .replace(/([&%$#_{}~^])/g, "\\$1");
    return ["", "```{=latex}",
        "\\begin{tcolorbox}[colback=gray!8,colframe=gray!40,title=\\textbf{Overview},fonttitle=\\bfseries,arc=2pt,boxrule=0.4pt]",
        escaped, "\\end{tcolorbox}", "```", ""].join("\n");
}

// ── Link resolution (path-qualified links resolve strictly) ───
function resolveFile(name, fromDir) {
    const all  = app.vault.getMarkdownFiles();
    const norm = name.toLowerCase().replace(/\\/g, "/").split("#")[0];
    const qualified = norm.includes("/");
    const key = f => f.path.toLowerCase().replace(/\\/g, "/").replace(/\.md$/, "");

    const rel = (fromDir.toLowerCase().replace(/\\/g, "/") + "/" + norm).replace(/\/+/g, "/");
    let hit = all.find(f => key(f) === rel);
    if (hit) return hit;

    hit = all.find(f => key(f) === norm);
    if (hit) return hit;

    if (qualified) {
        hit = all.find(f => key(f).endsWith("/" + norm));
        return hit || null;   // qualified links never fall back to basename
    }

    const base = norm.split("/").pop();
    hit = all.find(f =>
        path.dirname(f.path).toLowerCase().replace(/\\/g, "/") ===
            fromDir.toLowerCase().replace(/\\/g, "/") &&
        path.basename(f.path, ".md").toLowerCase() === base);
    if (hit) return hit;
    return all.find(f => path.basename(f.path, ".md").toLowerCase() === base) || null;
}

// ── The walker ────────────────────────────────────────────────
async function walk(content, baseLevel, fromDir, visited, depth) {
    let s = stripBacklinks(stripFrontmatter(content));
    const lines = s.split("\n");
    const offset = baseLevel - 1;
    const out = [];

    let curHeadingLevel = baseLevel;
    let curHeadingText  = pageTitle(content, null);
    let sawLinkUnderHeading = false;
    let contentSinceLink = false;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        // callout
        if (CALLOUT_RE.test(raw)) {
            const body = [raw.replace(CALLOUT_RE, "").replace(/^>?\s*/, "").trim()];
            while (i + 1 < lines.length && /^>/.test(lines[i + 1])) {
                body.push(lines[i + 1].replace(/^>\s?/, "").trim()); i++;
            }
            out.push(calloutBox(body.filter(Boolean)));
            if (sawLinkUnderHeading) contentSinceLink = true;
            continue;
        }

        // heading
        const hm = raw.match(/^(#{1,6})\s+(.+)$/);
        if (hm) {
            const lvl = Math.min(hm[1].length + offset, 6);
            if (sawLinkUnderHeading && curHeadingText &&
                hm[1].length !== 1 && lvl > curHeadingLevel) {
                out.push(`\n${"#".repeat(curHeadingLevel)} ${curHeadingText} (continued)\n`);
            }
            if (hm[1].length === 1) {
                curHeadingLevel = baseLevel;
                curHeadingText  = stripWikilinks(hm[2]).trim();
            } else {
                out.push("\n" + stripWikilinks(shiftHeadingLine(raw, offset)) + "\n");
                curHeadingLevel = lvl;
                curHeadingText  = stripWikilinks(hm[2]).trim();
            }
            sawLinkUnderHeading = false;
            contentSinceLink = false;
            continue;
        }

        // expansion link
        const target = expansionTarget(raw);
        if (target) {
            const linkLevel = Math.min(curHeadingLevel + 1, 6);

            if (depth >= MAX_DEPTH) {
                // depth cap reached: leave a plain reference instead of expanding
                out.push(`\n*[see: ${stripWikilinks(target)}]*\n`);
                sawLinkUnderHeading = true; contentSinceLink = false; continue;
            }
            const tfile = resolveFile(target, fromDir);
            if (!tfile) {
                out.push(`\n${"#".repeat(linkLevel)} [Page not found: ${target}]\n`);
                sawLinkUnderHeading = true; contentSinceLink = false; continue;
            }
            if (visited.has(tfile.path)) {
                out.push(`\n*[see: ${stripWikilinks(target)}]*\n`);
                sawLinkUnderHeading = true; contentSinceLink = false; continue;
            }

            const childContent = await app.vault.read(tfile);
            const childTitle = pageTitle(childContent, target.split("/").pop());
            out.push(`\n${"#".repeat(linkLevel)} ${childTitle}\n`);

            const nextVisited = new Set(visited); nextVisited.add(tfile.path);
            out.push(await walk(childContent, linkLevel,
                path.dirname(tfile.path).replace(/\\/g, "/"), nextVisited, depth + 1));

            sawLinkUnderHeading = true; contentSinceLink = false; continue;
        }

        // ordinary line
        const isContent = raw.trim() !== "" && !/^-{3,}\s*$/.test(raw.trim());
        if (sawLinkUnderHeading && !contentSinceLink && isContent && curHeadingText) {
            out.push(`\n${"#".repeat(curHeadingLevel)} ${curHeadingText} (continued)\n`);
            contentSinceLink = true;
        }
        out.push(stripWikilinks(raw));
    }
    return out.join("\n");
}

// ── Build ─────────────────────────────────────────────────────
const docTitle = pageTitle(indexContent, indexTitle);
const visited  = new Set([activeFile.path]);
const body     = await walk(indexContent, 1, indexDir, visited, 0);
const compiled = `# ${docTitle}\n${body}\n`;

// ── Compile to PDF ────────────────────────────────────────────
const tempMd  = path.join(vaultPath, indexDir, `_rollup_temp_${indexTitle}.md`);
const tempHdr = path.join(vaultPath, indexDir, `_rollup_header_${indexTitle}.tex`);
fs.writeFileSync(tempMd,  compiled,     "utf8");
fs.writeFileSync(tempHdr, LATEX_HEADER, "utf8");

const safeName = indexTitle.replace(/[^a-zA-Z0-9 &–—]/g, "").trim();
const pdfPath  = path.join(OUTPUT_DIR, `${safeName}.pdf`);
const needsToc = (compiled.match(/^###/m) !== null);

const pandocCmd = [
    PANDOC, `"${tempMd}"`, `-o "${pdfPath}"`,
    `--pdf-engine=${PDF_ENGINE}`,
    `-V geometry:margin=${MARGIN}`, `-V geometry:a4paper`,
    `--include-in-header="${tempHdr}"`,
    needsToc ? "--toc" : "", needsToc ? "--toc-depth=4" : "",
    `--standalone`
].filter(Boolean).join(" ");

exec(pandocCmd, (err, stdout, stderr) => {
    try { fs.unlinkSync(tempMd);  } catch(e) {}
    try { fs.unlinkSync(tempHdr); } catch(e) {}
    if (err) {
        new Notice(`Pandoc error: ${stderr || err.message}`);
        console.error("Pandoc stderr:", stderr);
    } else {
        new Notice(`✓ PDF saved: ${safeName}.pdf`);
    }
});
%>
