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
const MAX_DEPTH   = 2;   // variant: max 2 level(s) below the root
// ─────────────────────────────────────────────────────────────

const vaultPath    = app.vault.adapter.basePath;
const activeFile   = tp.file.find_tfile(tp.file.title);
const indexContent = await app.vault.read(activeFile);
const indexDir     = path.dirname(activeFile.path);
const OUTPUT_DIR   = path.join(vaultPath, indexDir);
const indexTitle   = tp.file.title;

const LATEX_HEADER = `\\usepackage{tcolorbox}
\\tcbuselibrary{skins}
\\usepackage{titlesec}
% Make paragraph (h4) and subparagraph (h5) display as standalone headings
% with their own line, instead of LaTeX's default run-in (inline) style.
\\titleformat{\\paragraph}[hang]{\\normalfont\\normalsize\\bfseries}{\\theparagraph}{1em}{}
\\titlespacing*{\\paragraph}{0pt}{2.0ex plus 1ex minus .2ex}{1.0ex plus .2ex}
\\titleformat{\\subparagraph}[hang]{\\normalfont\\normalsize\\bfseries\\itshape}{\\thesubparagraph}{1em}{}
\\titlespacing*{\\subparagraph}{0pt}{1.6ex plus 1ex minus .2ex}{0.8ex plus .2ex}
% Number and include deep headings in the TOC
\\setcounter{secnumdepth}{5}
\\setcounter{tocdepth}{5}
% Tighten TOC indentation with no extra packages: redefine the kernel
% \\l@... entries to use smaller per-level indents and number widths.
\\makeatletter
\\renewcommand*\\l@section{\\@dottedtocline{1}{1.0em}{2.0em}}
\\renewcommand*\\l@subsection{\\@dottedtocline{2}{2.4em}{2.6em}}
\\renewcommand*\\l@subsubsection{\\@dottedtocline{3}{4.0em}{3.2em}}
\\renewcommand*\\l@paragraph{\\@dottedtocline{4}{5.6em}{3.8em}}
\\renewcommand*\\l@subparagraph{\\@dottedtocline{5}{7.4em}{4.4em}}
\\makeatother
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
    const m = content.match(/^#{1,6} (.+)$/m);
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
        "\\begin{tcolorbox}[colback=gray!8,colframe=gray!40,title=\\textbf{Overview},fonttitle=\\bfseries,arc=2pt,boxrule=0.4pt,left=6pt,right=6pt]",
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
    // The page's shallowest heading maps to baseLevel. With H1s omitted (notes
    // start at H2), this keeps nesting correct regardless of the top level used.
    let topLevel = 7;
    for (const ln of lines) {
        const m = ln.match(/^(#{1,6})\s+\S/);
        if (m) topLevel = Math.min(topLevel, m[1].length);
    }
    if (topLevel === 7) topLevel = 1;
    const offset = baseLevel - topLevel;
    const out = [];

    // Before any heading is seen, the "current heading level" is one above the
    // page's base, so a bare link at the top of a page emits at baseLevel (not
    // baseLevel+1). Real headings overwrite this as they appear.
    let curHeadingLevel = Math.max(baseLevel - 1, 1);
    let curHeadingText  = pageTitle(content, null);
    let sawLinkUnderHeading = false;
    let contentSinceLink = false;
    // Set to the current heading's text right after a heading is emitted, and
    // cleared by any real content. When a link fires while this is set, the
    // link reuses that heading as its section title (the linked page's own H1
    // is dropped) — so every index hop is exactly one heading level.
    let immediateHeadingText = null;

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
            // A summary callout between a heading and its link does not break
            // heading-reuse: the link still adopts the heading above the callout.
            continue;
        }

        // heading
        const hm = raw.match(/^(#{1,6})\s+(.+)$/);
        if (hm) {
            const lvl = Math.min(hm[1].length + offset, 6);
            out.push("\n" + stripWikilinks(shiftHeadingLine(raw, offset)) + "\n");
            curHeadingLevel = lvl;
            curHeadingText  = stripWikilinks(hm[2]).trim();
            immediateHeadingText = curHeadingText;
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
                sawLinkUnderHeading = true; contentSinceLink = false;
                immediateHeadingText = null; continue;
            }
            const tfile = resolveFile(target, fromDir);
            if (!tfile) {
                out.push(`\n${"#".repeat(linkLevel)} [Page not found: ${target}]\n`);
                sawLinkUnderHeading = true; contentSinceLink = false;
                immediateHeadingText = null; continue;
            }
            if (visited.has(tfile.path)) {
                out.push(`\n*[see: ${stripWikilinks(target)}]*\n`);
                sawLinkUnderHeading = true; contentSinceLink = false;
                immediateHeadingText = null; continue;
            }

            const childContent = await app.vault.read(tfile);
            // Title for a link that has no heading to reuse: the note's filename
            // (notes no longer carry an H1). Never the first body heading, which
            // would duplicate it.
            const childTitle = target.split("/").pop();

            // If this link sits directly under a heading (only blanks/a summary
            // callout between), that heading IS the section title: reuse it and
            // nest the page's content one level below. Otherwise (a bare list of
            // sibling links, or a link after prose) emit the filename as the
            // section heading and nest the page's content below that.
            let childBaseLevel;
            if (immediateHeadingText !== null) {
                childBaseLevel = curHeadingLevel + 1;    // under the reused heading
            } else {
                out.push(`\n${"#".repeat(linkLevel)} ${childTitle}\n`);
                childBaseLevel = Math.min(linkLevel + 1, 6);  // content below the title
            }

            const nextVisited = new Set(visited); nextVisited.add(tfile.path);
            out.push(await walk(childContent, childBaseLevel,
                path.dirname(tfile.path).replace(/\\/g, "/"), nextVisited, depth + 1));

            sawLinkUnderHeading = true; contentSinceLink = false;
            immediateHeadingText = null; continue;
        }

        // ordinary line
        const isContent = raw.trim() !== "" && !/^-{3,}\s*$/.test(raw.trim());
        if (sawLinkUnderHeading && !contentSinceLink && isContent && curHeadingText) {
            out.push(`\n${"#".repeat(curHeadingLevel)} ${curHeadingText} (continued)\n`);
            contentSinceLink = true;
        }
        if (isContent) {
            // Prose between a heading and its link does NOT break heading reuse;
            // it becomes the chapter intro. Reuse is only consumed by a link or
            // reset by the next heading. (We intentionally do not clear
            // immediateHeadingText here.)
        }
        out.push(stripWikilinks(raw));
    }
    return out.join("\n");
}

// ── Build ─────────────────────────────────────────────────────
const docTitle = indexTitle;   // document title is the root note's filename
const visited  = new Set([activeFile.path]);
const body     = await walk(indexContent, 2, indexDir, visited, 0);
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
    needsToc ? "--toc" : "", needsToc ? "--toc-depth=5" : "",
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
