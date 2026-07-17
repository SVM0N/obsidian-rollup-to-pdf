import type { App, TFile } from "obsidian";

// The CSV Card View community plugin embeds interactive table/cards/kanban
// views via a ```csv-view``` fenced block (file:/mode:/collapse: directives).
// Pandoc can't run that plugin, so without this the block prints as literal
// source. Here we read the referenced CSV and emit a static Markdown table
// (grouped, for cards/kanban) so the data renders in the PDF.

export function resolveCsvPath(input: string, fromDir: string): string {
	if (!input) return input;
	const isRel = input.startsWith("./") || input.startsWith("../");
	if (!isRel && input.includes("/")) return input; // vault-relative
	if (!isRel) return fromDir ? fromDir + "/" + input : input; // sibling
	const stack = fromDir ? fromDir.split("/").filter(Boolean) : [];
	for (const seg of input.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") stack.pop();
		else stack.push(seg);
	}
	return stack.join("/");
}

export function parseCsvText(text: string): string[][] {
	const rows: string[][] = [];
	let cur: string[] = [],
		field = "",
		inQ = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQ) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else inQ = false;
			} else field += c;
		} else if (c === '"') inQ = true;
		else if (c === ",") {
			cur.push(field);
			field = "";
		} else if (c === "\n") {
			cur.push(field);
			rows.push(cur);
			cur = [];
			field = "";
		} else if (c !== "\r") field += c;
	}
	if (field.length || cur.length) {
		cur.push(field);
		rows.push(cur);
	}
	return rows.filter((r) => r.length && !(r.length === 1 && r[0].trim() === ""));
}

export function mdTable(headers: string[], rows: string[][]): string {
	// Shorten URLs to [host](url) so long links don't overflow the PDF page —
	// only the short host text renders; the full URL lives in the link target.
	const linkify = (s: string) =>
		s.replace(/https?:\/\/[^\s|)\]]+/g, (u) => {
			const m = u.match(/^https?:\/\/([^/]+)/);
			const host = (m ? m[1] : u).replace(/^www\./, "");
			return `[${host}](${u})`;
		});
	const esc = (s: string | undefined) =>
		linkify(
			(s ?? "")
				.replace(/\|/g, "\\|")
				.replace(/\s*\n+\s*/g, " ")
				.trim(),
		);
	const head = "| " + headers.map(esc).join(" | ") + " |";
	const sep = "| " + headers.map(() => "---").join(" | ") + " |";
	const body = rows.map((r) => "| " + headers.map((_, i) => esc(r[i])).join(" | ") + " |").join("\n");
	return [head, sep, body].filter(Boolean).join("\n");
}

export function detectGroupCol(headers: string[]): string | null {
	const find = (names: string[]) => headers.find((h) => names.includes(h.toLowerCase().trim()));
	return (
		find(["status", "state", "progress", "stage"]) ||
		find(["category", "categories", "genre", "genres", "type", "types", "tag", "tags", "topic", "section"]) ||
		null
	);
}

export async function renderCsvBlock(app: App, body: string, fromDir: string): Promise<string> {
	const lines = body
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	const opt = (k: string) => (lines.find((l) => l.toLowerCase().startsWith(k + ":")) || "").slice(k.length + 1).trim();
	const fileOpt = opt("file");
	if (!fileOpt) return "*[csv-view: no file specified]*";
	const csvPath = resolveCsvPath(fileOpt, fromDir);
	const tfile = app.vault.getAbstractFileByPath(csvPath) as TFile | null;
	if (!tfile) return `*[csv-view: file not found: ${csvPath}]*`;
	const rows = parseCsvText(await app.vault.read(tfile));
	if (!rows.length) return "*[csv-view: empty file]*";
	const headers = rows[0],
		data = rows.slice(1);
	if (!data.length) return "*[csv-view: no rows]*";

	const rawMode = opt("mode").toLowerCase();
	const grouped = rawMode === "cards" || rawMode === "card" || rawMode === "library" || rawMode === "kanban" || rawMode === "kanban-genre";
	const collapse = new Set(
		opt("collapse")
			.split(",")
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean),
	);

	if (!grouped) return mdTable(headers, data);

	// Cards/Kanban → group by Status/Category, one labelled sub-table per group.
	const gc = detectGroupCol(headers);
	if (!gc) return mdTable(headers, data);
	const gi = headers.indexOf(gc);
	const order: string[] = [];
	const buckets: Record<string, string[][]> = {};
	for (const r of data) {
		const key = (r[gi] || "—").trim() || "—";
		if (!buckets[key]) {
			buckets[key] = [];
			order.push(key);
		}
		buckets[key].push(r);
	}
	const rest = headers.filter((_, i) => i !== gi);
	const out: string[] = [];
	for (const key of order.sort()) {
		if (collapse.has(key.toLowerCase())) continue; // `collapse:` hides the group
		const sub = buckets[key].map((r) => rest.map((h) => r[headers.indexOf(h)]));
		out.push(`**${key}** (${buckets[key].length})\n\n${mdTable(rest, sub)}`);
	}
	return out.join("\n\n");
}

export async function expandCsvViews(app: App, content: string, fromDir: string): Promise<string> {
	const re = /^[ \t]*`{3,}[ \t]*csv-view[ \t]*\n([\s\S]*?)\n[ \t]*`{3,}[ \t]*$/gim;
	const blocks: { full: string; body: string }[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(content)) !== null) blocks.push({ full: m[0], body: m[1] });
	for (const b of blocks) content = content.split(b.full).join(await renderCsvBlock(app, b.body, fromDir));
	return content;
}
