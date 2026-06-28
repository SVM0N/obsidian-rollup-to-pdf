<%*
// ============================================================
// ROLLUP TO PDF — APPENDIX MODE
// ------------------------------------------------------------
// Like the main renderer, but instead of expanding a linked
// note INLINE, it moves the note's content to an APPENDIX at
// the end of the document and leaves a reference in the body.
//
// In the body, where a line-leading "→ [[Page]]" appeared:
//     **Page Title** (see Appendix 2.4.1)
//
// The appendix number tracks the body heading position at the
// point the link appears: <section>.<subsection>.<n>, where n
// counts links under that subsection. Links found INSIDE an
// appendix recurse into deeper appendices (e.g. 2.4.1.1).
//
// Same link rules as the main template: only a line-leading
// "→ [[...]]" expands; list items, inline arrows, and "->" stay
// plain text. "> [!summary]"/"> [!overview]" → Overview box.
// ============================================================

const fs   = require("fs");
const path = require("path");
const { exec } = require("child_process");

// ── Config ───────────────────────────────────────────────────
const PANDOC      = "/opt/homebrew/bin/pandoc";
const PDF_ENGINE  = "/usr/local/bin/xelatex";   // Unicode-capable engine (was pdflatex, which can't render CJK/non-Latin scripts)
const CJK_FONT    = "PingFang SC";              // font for Chinese/Japanese/Korean glyphs (macOS built-in)
const MARGIN      = "2cm";
const MAX_DEPTH   = Infinity;   // recursion levels of appendices (Infinity = unlimited)
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
\\setcounter{secnumdepth}{-1}
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
        return hit || null;
    }

    const base = norm.split("/").pop();
    hit = all.find(f =>
        path.dirname(f.path).toLowerCase().replace(/\\/g, "/") ===
            fromDir.toLowerCase().replace(/\\/g, "/") &&
        path.basename(f.path, ".md").toLowerCase() === base);
    if (hit) return hit;
    return all.find(f => path.basename(f.path, ".md").toLowerCase() === base) || null;
}

// ── Appendix collection ───────────────────────────────────────
// appendices: array of { number: "2.4.1", title, content (markdown) }.
// Filled in document order so the appendix section reads top to bottom.
const appendices = [];

// Walk a page, emitting its body and queueing any links as appendices.
// numberPrefix: dotted string identifying THIS content's position
//   - for the root body it is "" (links get <sec>.<sub>.<n>)
//   - for an appendix it is that appendix's own number (links get prefix.<n>)
// secCtr/subCtr track the body heading position WITHIN this content.
// ── csv-view expansion ───────────────────────────────────────
// The CSV Card View plugin embeds interactive table/cards/kanban views via a
// ```csv-view``` fenced block (file:/mode:/collapse: directives). Pandoc can't
// run that plugin, so without this the block prints as literal source. Here we
// read the referenced CSV and emit a static Markdown table (grouped, for
// cards/kanban) so the data renders in the PDF.
function resolveCsvPath(input, fromDir) {
    if (!input) return input;
    const isRel = input.startsWith("./") || input.startsWith("../");
    if (!isRel && input.includes("/")) return input;            // vault-relative
    if (!isRel) return fromDir ? fromDir + "/" + input : input; // sibling
    const stack = fromDir ? fromDir.split("/").filter(Boolean) : [];
    for (const seg of input.split("/")) {
        if (seg === "" || seg === ".") continue;
        if (seg === "..") stack.pop(); else stack.push(seg);
    }
    return stack.join("/");
}
function parseCsvText(text) {
    const rows = []; let cur = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
            else field += c;
        } else if (c === '"') inQ = true;
        else if (c === ",") { cur.push(field); field = ""; }
        else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
        else if (c !== "\r") field += c;
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    return rows.filter(r => r.length && !(r.length === 1 && r[0].trim() === ""));
}
function mdTable(headers, rows) {
    // Shorten URLs to [host](url) so long links don't overflow the PDF page —
    // only the short host text renders; the full URL lives in the link target.
    const linkify = s => s.replace(/https?:\/\/[^\s|)\]]+/g, u => {
        const host = (u.match(/^https?:\/\/([^/]+)/) || [, u])[1].replace(/^www\./, "");
        return `[${host}](${u})`;
    });
    const esc = s => linkify(String(s ?? "").replace(/\|/g, "\\|").replace(/\s*\n+\s*/g, " ").trim());
    const head = "| " + headers.map(esc).join(" | ") + " |";
    const sep  = "| " + headers.map(() => "---").join(" | ") + " |";
    const body = rows.map(r => "| " + headers.map((_, i) => esc(r[i])).join(" | ") + " |").join("\n");
    return [head, sep, body].filter(Boolean).join("\n");
}
function detectGroupCol(headers) {
    const find = names => headers.find(h => names.includes(h.toLowerCase().trim()));
    return find(["status", "state", "progress", "stage"])
        || find(["category", "categories", "genre", "genres", "type", "types", "tag", "tags", "topic", "section"])
        || null;
}
async function renderCsvBlock(body, fromDir) {
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
    const opt = k => (lines.find(l => l.toLowerCase().startsWith(k + ":")) || "").slice(k.length + 1).trim();
    const fileOpt = opt("file");
    if (!fileOpt) return "*[csv-view: no file specified]*";
    const csvPath = resolveCsvPath(fileOpt, fromDir);
    const tfile = app.vault.getAbstractFileByPath(csvPath);
    if (!tfile) return `*[csv-view: file not found: ${csvPath}]*`;
    const rows = parseCsvText(await app.vault.read(tfile));
    if (!rows.length) return "*[csv-view: empty file]*";
    const headers = rows[0], data = rows.slice(1);
    if (!data.length) return "*[csv-view: no rows]*";

    const rawMode = opt("mode").toLowerCase();
    const grouped = rawMode === "cards" || rawMode === "card" || rawMode === "library"
                 || rawMode === "kanban" || rawMode === "kanban-genre";
    const collapse = new Set(opt("collapse").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));

    if (!grouped) return mdTable(headers, data);

    // Cards/Kanban → group by Status/Category, one labelled sub-table per group.
    const gc = detectGroupCol(headers);
    if (!gc) return mdTable(headers, data);
    const gi = headers.indexOf(gc);
    const order = [], buckets = {};
    for (const r of data) {
        const key = (r[gi] || "—").trim() || "—";
        if (!buckets[key]) { buckets[key] = []; order.push(key); }
        buckets[key].push(r);
    }
    const rest = headers.filter((_, i) => i !== gi);
    const out = [];
    for (const key of order.sort()) {
        if (collapse.has(key.toLowerCase())) continue; // `collapse:` hides the group
        const sub = buckets[key].map(r => rest.map(h => r[headers.indexOf(h)]));
        out.push(`**${key}** (${buckets[key].length})\n\n${mdTable(rest, sub)}`);
    }
    return out.join("\n\n");
}
async function expandCsvViews(content, fromDir) {
    const re = /^[ \t]*`{3,}[ \t]*csv-view[ \t]*\n([\s\S]*?)\n[ \t]*`{3,}[ \t]*$/gim;
    const blocks = [];
    let m;
    while ((m = re.exec(content)) !== null) blocks.push({ full: m[0], body: m[1] });
    for (const b of blocks) content = content.split(b.full).join(await renderCsvBlock(b.body, fromDir));
    return content;
}

async function walk(content, baseLevel, fromDir, visited, depth, numberPrefix) {
    content = await expandCsvViews(content, fromDir);
    let s = stripBacklinks(stripFrontmatter(content));
    const lines = s.split("\n");

    let topLevel = 7;
    for (const ln of lines) {
        const m = ln.match(/^(#{1,6})\s+\S/);
        if (m) topLevel = Math.min(topLevel, m[1].length);
    }
    if (topLevel === 7) topLevel = 1;
    const offset = baseLevel - topLevel;

    const out = [];
    // Position counters for the appendix numbering of links found here.
    // secCtr increments on each shallowest-level heading; subCtr on the next
    // level down; linkCtr counts links since the last subheading change.
    let secCtr = 0, subCtr = 0, linkCtr = 0;
    let calloutAcc = null;
    // To embed a reference into the chapter heading: remember the out[] index of
    // the most recent heading and whether any real content has appeared since.
    let lastHeadingIdx = -1;
    let contentSinceHeading = true;

    function flushCallout() {
        if (calloutAcc) { out.push(calloutBox(calloutAcc)); calloutAcc = null; }
    }

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        // accumulate a summary/overview callout block
        if (CALLOUT_RE.test(raw)) {
            calloutAcc = [];
            let j = i + 1;
            const first = raw.replace(CALLOUT_RE, "").replace(/^>?\s*/, "").trim();
            if (first) calloutAcc.push(first);
            while (j < lines.length && /^>/.test(lines[j])) {
                calloutAcc.push(lines[j].replace(/^>\s?/, "").trim());
                j++;
            }
            i = j - 1;
            continue;   // a callout between a heading and its link is fine
        }
        flushCallout();

        // heading: update position counters and emit (shifted)
        const hm = raw.match(/^(#{1,6})\s+(.+)$/);
        if (hm) {
            const lvl = hm[1].length;
            if (lvl === topLevel)      { secCtr++; subCtr = 0; if (!numberPrefix) linkCtr = 0; }
            else if (lvl === topLevel + 1) { subCtr++; if (!numberPrefix) linkCtr = 0; }
            out.push("\n" + stripWikilinks(shiftHeadingLine(raw, offset)) + "\n");
            lastHeadingIdx = out.length - 1;
            contentSinceHeading = false;
            continue;
        }

        // expansion link → move to appendix, leave a reference in the body
        const target = expansionTarget(raw);
        if (target) {
            const tfile = resolveFile(target, fromDir);
            const shownTitle = target.split("/").pop();
            linkCtr++;

            const here = numberPrefix
                ? `${numberPrefix}.${linkCtr}`
                : (subCtr > 0
                    ? `${secCtr}.${subCtr}.${linkCtr}`
                    : `${secCtr}.${linkCtr}`);

            if (!tfile) {
                out.push(`\n**${shownTitle}** *(missing — see Appendix ${here})*\n`);
                appendices.push({ number: here, title: shownTitle,
                    content: `*Page not found: ${shownTitle}*` });
                contentSinceHeading = true;
                continue;
            }

            const refMark = visited.has(tfile.path)
                ? `*(see Appendix ${here}; already included)*`
                : `*(see Appendix ${here})*`;

            // If a chapter heading sits directly above this link (only blanks or
            // a callout between), embed the reference INTO that heading instead
            // of emitting a separate line: "### Covert Operations (see Appendix …)".
            if (lastHeadingIdx !== -1 && !contentSinceHeading) {
                out[lastHeadingIdx] = out[lastHeadingIdx].replace(/\s*$/, "") +
                    ` ${refMark}\n`;
            } else {
                out.push(`\n**${shownTitle}** ${refMark}\n`);
            }
            contentSinceHeading = true;

            if (visited.has(tfile.path)) continue;

            const childContent = await app.vault.read(tfile);
            const childDir = path.dirname(tfile.path).replace(/\\/g, "/");
            const nextVisited = new Set(visited); nextVisited.add(tfile.path);

            // Push the parent appendix entry FIRST (document order), then recurse
            // so any nested-link appendices are queued after it.
            const entry = { number: here, title: shownTitle, content: "" };
            appendices.push(entry);

            // All appendix titles render flat at h2, so each appendix's own
            // content starts at h3 regardless of how deep its number is.
            const innerBase = 3;

            if (depth + 1 <= MAX_DEPTH) {
                entry.content = await walk(childContent, innerBase, childDir, nextVisited,
                                           depth + 1, here);
            } else {
                entry.content = stripWikilinks(stripBacklinks(stripFrontmatter(childContent)));
            }
            continue;
        }

        const cleaned = stripWikilinks(raw);
        out.push(cleaned);
        if (cleaned.trim() !== "") contentSinceHeading = true;
    }
    flushCallout();
    return out.join("\n");
}

// ── Build body ────────────────────────────────────────────────
const docTitle = indexTitle;
const visited  = new Set([activeFile.path]);
const body     = await walk(indexContent, 1, indexDir, visited, 0, "");

// ── Assemble appendices, sorted by dotted number ───────────────
function numKey(n) { return n.split(".").map(x => String(x).padStart(4, "0")).join("."); }
appendices.sort((a, b) => numKey(a.number) < numKey(b.number) ? -1
                        : numKey(a.number) > numKey(b.number) ? 1 : 0);

let appendixMd = "";
if (appendices.length) {
    appendixMd = "\n\n# Appendices\n";
    for (const a of appendices) {
        // All appendix entries are flat at h2; the dotted number conveys the
        // hierarchy. They are already sorted depth-first (a parent is followed
        // by all its descendants before the next sibling).
        appendixMd += `\n## Appendix ${a.number} — ${a.title}\n\n${a.content}\n`;
    }
}

const compiled = `${body}\n${appendixMd}\n`;

// ── Compile to PDF ────────────────────────────────────────────
const tempMd  = path.join(vaultPath, indexDir, `_rollup_temp_${indexTitle}.md`);
const tempHdr = path.join(vaultPath, indexDir, `_rollup_header_${indexTitle}.tex`);
fs.writeFileSync(tempMd,  compiled,     "utf8");
fs.writeFileSync(tempHdr, LATEX_HEADER, "utf8");

const safeName = indexTitle.replace(/[^a-zA-Z0-9 &–—]/g, "").trim();
const pdfPath  = path.join(OUTPUT_DIR, `${safeName} (appendix).pdf`);
const needsToc = (compiled.match(/^##/m) !== null) || appendices.length > 0;

const pandocCmd = [
    PANDOC, `"${tempMd}"`, `-o "${pdfPath}"`,
    `--metadata title="${docTitle}"`,
    "--number-sections",
    `--pdf-engine=${PDF_ENGINE}`,
    `-V CJKmainfont="${CJK_FONT}"`,
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
        new Notice(`✓ PDF saved: ${safeName} (appendix).pdf`);
    }
});
%>
