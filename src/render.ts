import { App, FileSystemAdapter, Notice, TFile } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { RollupSettings } from "./settings";
import { walkInline, walkAppendix, Appendix, RenderContext } from "./walker";
import { loadSnippetSpanStyles } from "./css-snippets";
import { hasCjkText } from "./text-utils";

export type Variant = "full" | "depth1" | "depth2" | "appendix";

const LATEX_HEADER = `\\usepackage{tcolorbox}
\\tcbuselibrary{skins}
\\usepackage{titlesec}
\\usepackage{multicol}
\\usepackage{xcolor}
\\usepackage{fontspec}
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

const APPENDIX_LATEX_HEADER = LATEX_HEADER.replace("\\setcounter{secnumdepth}{5}", "\\setcounter{secnumdepth}{-1}");

function getBasePath(app: App): string {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		throw new Error("Rollup to PDF requires the desktop app (a filesystem-backed vault).");
	}
	return adapter.getBasePath();
}

function numKey(n: string): string {
	return n
		.split(".")
		.map((x) => String(x).padStart(4, "0"))
		.join(".");
}

// The LaTeX engine reports a glyph its fonts can't draw as a warning on
// stderr and then silently drops it from the PDF; Pandoc still exits 0. With
// the CJK font setting empty (the default), a note of Chinese vocabulary
// therefore compiles to a "successful" PDF with every hanzi missing. Pulling
// the distinct characters out of stderr turns that into something the Notice
// can actually say.
export function missingGlyphs(stderr: string): string[] {
	const seen = new Set<string>();
	const re = /Missing character: There is no (.+?) \(U\+[0-9A-Fa-f]+\)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(stderr)) !== null) seen.add(m[1]);
	return [...seen];
}

async function runPandoc(settings: RollupSettings, tempMd: string, tempHdr: string, pdfPath: string, docTitle: string, needsToc: boolean, hasCjk: boolean): Promise<string> {
	const args = [
		tempMd,
		"-o",
		pdfPath,
		`--pdf-engine=${settings.pdfEnginePath}`,
		"--metadata",
		`title=${docTitle}`,
		"--number-sections",
		"-V",
		`geometry:margin=${settings.margin}`,
		"-V",
		"geometry:a4paper",
		"--include-in-header",
		tempHdr,
		"--standalone",
	];
	// Only when the document needs it — see hasCjkText for why.
	if (settings.cjkFont && hasCjk) args.push("-V", `CJKmainfont=${settings.cjkFont}`);
	if (needsToc) args.push("--toc", "--toc-depth=5");

	return await new Promise<string>((resolve, reject) => {
		// execFile (no shell) so note titles/paths containing quotes, `$()`, or
		// other shell metacharacters can never be interpreted as shell syntax.
		// maxBuffer is raised well above Node's 1 MB default: the engine emits
		// ~110 bytes of warning per unrenderable glyph, so a long CJK rollup
		// with no font set overflows the default, gets pandoc killed mid-run,
		// and reports a build failure for a document that would have compiled.
		execFile(settings.pandocPath, args, { maxBuffer: 32 * 1024 * 1024 }, (err, _stdout, stderr) => {
			if (err) reject(new Error(stderr || err.message));
			else resolve(stderr || "");
		});
	});
}

export async function renderRollup(app: App, activeFile: TFile, settings: RollupSettings, variant: Variant): Promise<void> {
	const maxDepth = variant === "depth1" ? 1 : variant === "depth2" ? 2 : Infinity;
	const isAppendix = variant === "appendix";

	const vaultPath = getBasePath(app);
	const indexContent = await app.vault.read(activeFile);
	const indexDir = path.dirname(activeFile.path);
	const outputDir = path.join(vaultPath, indexDir);
	const indexTitle = activeFile.basename;

	const visited = new Set<string>([activeFile.path]);
	const ctx: RenderContext = { vaultPath, spanStyles: loadSnippetSpanStyles(app, vaultPath) };

	let compiled: string;
	if (isAppendix) {
		const appendices: Appendix[] = [];
		const body = await walkAppendix(app, indexContent, 1, indexDir, visited, 0, maxDepth, "", appendices, ctx);
		appendices.sort((a, b) => (numKey(a.number) < numKey(b.number) ? -1 : numKey(a.number) > numKey(b.number) ? 1 : 0));
		let appendixMd = "";
		if (appendices.length) {
			appendixMd = "\n\n# Appendices\n";
			for (const a of appendices) {
				appendixMd += `\n## Appendix ${a.number} — ${a.title}\n\n${a.content}\n`;
			}
		}
		compiled = `${body}\n${appendixMd}\n`;
	} else {
		// The root note's filename is the document title (passed to Pandoc as
		// metadata, rendered as the title block). The root's own content starts
		// at the top heading level (#) rather than being pushed under a
		// redundant "# Title" heading — this reclaims one heading level for
		// deep rollups.
		const body = await walkInline(app, indexContent, 1, indexDir, visited, 0, maxDepth, ctx);
		compiled = `${body}\n`;
	}

	const tempMd = path.join(vaultPath, indexDir, `_rollup_temp_${indexTitle}.md`);
	const tempHdr = path.join(vaultPath, indexDir, `_rollup_header_${indexTitle}.tex`);
	fs.writeFileSync(tempMd, compiled, "utf8");
	fs.writeFileSync(tempHdr, isAppendix ? APPENDIX_LATEX_HEADER : LATEX_HEADER, "utf8");

	const safeName = indexTitle.replace(/[^a-zA-Z0-9 &–—]/g, "").trim();
	const suffix = isAppendix ? " (appendix)" : "";
	const pdfPath = path.join(outputDir, `${safeName}${suffix}.pdf`);
	const needsToc = /^##/m.test(compiled) || (isAppendix && /^## Appendix /m.test(compiled));

	try {
		const stderr = await runPandoc(settings, tempMd, tempHdr, pdfPath, indexTitle, needsToc, hasCjkText(compiled));
		const missing = missingGlyphs(stderr);
		if (missing.length) {
			const sample = missing.slice(0, 8).join(" ");
			const more = missing.length > 8 ? ` +${missing.length - 8} more` : "";
			new Notice(
				`✓ PDF saved: ${safeName}${suffix}.pdf — but ${missing.length} character(s) are missing from it (${sample}${more}). ` +
					`Your LaTeX fonts can't draw them; for Chinese/Japanese/Korean, set a CJK font in the plugin settings.`,
				15000,
			);
			console.warn("Rollup to PDF — characters dropped by the LaTeX engine:", missing.join(" "));
		} else {
			new Notice(`✓ PDF saved: ${safeName}${suffix}.pdf`);
		}
	} catch (e) {
		new Notice(`Pandoc error: ${(e as Error).message}`);
		console.error("Pandoc stderr:", e);
	} finally {
		try {
			fs.unlinkSync(tempMd);
		} catch {
			/* best-effort cleanup */
		}
		try {
			fs.unlinkSync(tempHdr);
		} catch {
			/* best-effort cleanup */
		}
	}
}
