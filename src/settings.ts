import { App, PluginSettingTab, Setting } from "obsidian";
import type RollupToPdfPlugin from "../main";

export interface RollupSettings {
	pandocPath: string;
	pdfEnginePath: string;
	cjkFont: string;
	margin: string;
}

// Defaults rely on `pandoc`/`xelatex` being resolvable on PATH, which is how
// Homebrew, apt, MacTeX, MiKTeX, and TeX Live installers all set themselves
// up by default. Users with a non-PATH install (or multiple pandoc/LaTeX
// installs) can point at a specific binary here.
export const DEFAULT_SETTINGS: RollupSettings = {
	pandocPath: "pandoc",
	pdfEnginePath: "xelatex",
	cjkFont: "",
	margin: "2cm",
};

// This tab intentionally keeps the classic display() override rather than
// Obsidian's newer declarative settings API: that API only adds benefit
// (settings-search indexing) on Obsidian 1.13+, our minAppVersion is 1.4.0,
// and porting to it is a rearchitecture, not a functional gap.
export class RollupSettingTab extends PluginSettingTab {
	plugin: RollupToPdfPlugin;

	constructor(app: App, plugin: RollupToPdfPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Below, "Pandoc", "PATH", "xelatex", "CJK", "Chinese/Japanese/Korean",
		// "Noto Sans CJK SC", and "2cm" keep their real-world casing (product
		// name, env var, literal binary name, acronym, language names, literal
		// font name, literal example value) rather than being sentence-cased —
		// lowercasing any of them would be wrong, not just non-conformant.
		new Setting(containerEl)
			.setName("Pandoc path")
			.setDesc("Path to the Pandoc executable, or just \"pandoc\" if it's on your PATH.")
			.addText((text) =>
				text
					.setPlaceholder("pandoc")
					.setValue(this.plugin.settings.pandocPath)
					.onChange(async (value) => {
						this.plugin.settings.pandocPath = value.trim() || DEFAULT_SETTINGS.pandocPath;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("PDF engine path")
			.setDesc("Path to a Unicode-capable LaTeX engine (e.g. xelatex or lualatex), or just its name if it's on your PATH.")
			.addText((text) =>
				text
					.setPlaceholder("xelatex")
					.setValue(this.plugin.settings.pdfEnginePath)
					.onChange(async (value) => {
						this.plugin.settings.pdfEnginePath = value.trim() || DEFAULT_SETTINGS.pdfEnginePath;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("CJK font")
			.setDesc("Font used for Chinese/Japanese/Korean glyphs (must be installed on your system). Leave blank to skip CJK font configuration.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Noto Sans CJK SC")
					.setValue(this.plugin.settings.cjkFont)
					.onChange(async (value) => {
						this.plugin.settings.cjkFont = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Page margin")
			.setDesc("Page margin passed to Pandoc's geometry setting.")
			.addText((text) =>
				text
					.setPlaceholder("2cm")
					.setValue(this.plugin.settings.margin)
					.onChange(async (value) => {
						this.plugin.settings.margin = value.trim() || DEFAULT_SETTINGS.margin;
						await this.plugin.saveSettings();
					}),
			);
	}
}
