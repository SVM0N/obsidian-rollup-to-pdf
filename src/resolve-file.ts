import type { App, TFile } from "obsidian";
import * as path from "path";

// Link resolution: path-qualified links (containing "/") resolve strictly
// and never fall back to a basename match, so "Foo/Bar" never matches an
// unrelated "Bar" elsewhere in the vault.
export function resolveFile(app: App, name: string, fromDir: string): TFile | null {
	const all = app.vault.getMarkdownFiles();
	const norm = name.toLowerCase().replace(/\\/g, "/").split("#")[0];
	const qualified = norm.includes("/");
	const key = (f: TFile) => f.path.toLowerCase().replace(/\\/g, "/").replace(/\.md$/, "");

	const rel = (fromDir.toLowerCase().replace(/\\/g, "/") + "/" + norm).replace(/\/+/g, "/");
	let hit = all.find((f) => key(f) === rel);
	if (hit) return hit;

	hit = all.find((f) => key(f) === norm);
	if (hit) return hit;

	if (qualified) {
		hit = all.find((f) => key(f).endsWith("/" + norm));
		return hit || null;
	}

	const base = norm.split("/").pop() as string;
	hit = all.find(
		(f) =>
			path.dirname(f.path).toLowerCase().replace(/\\/g, "/") === fromDir.toLowerCase().replace(/\\/g, "/") &&
			path.basename(f.path, ".md").toLowerCase() === base,
	);
	if (hit) return hit;
	return all.find((f) => path.basename(f.path, ".md").toLowerCase() === base) || null;
}
