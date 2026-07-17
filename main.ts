import { Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, RollupSettings, RollupSettingTab } from "./src/settings";
import { renderRollup, Variant } from "./src/render";

const COMMANDS: { id: string; name: string; variant: Variant }[] = [
	{ id: "render-full", name: "Render rollup to PDF (full recursion)", variant: "full" },
	{ id: "render-depth-1", name: "Render rollup to PDF (max 1 level deep)", variant: "depth1" },
	{ id: "render-depth-2", name: "Render rollup to PDF (max 2 levels deep)", variant: "depth2" },
	{ id: "render-appendix", name: "Render rollup to PDF (appendix mode)", variant: "appendix" },
];

export default class RollupToPdfPlugin extends Plugin {
	settings!: RollupSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new RollupSettingTab(this.app, this));

		for (const cmd of COMMANDS) {
			this.addCommand({
				id: cmd.id,
				name: cmd.name,
				checkCallback: (checking: boolean) => {
					const file = this.app.workspace.getActiveFile();
					if (!(file instanceof TFile) || file.extension !== "md") return false;
					if (!checking) {
						renderRollup(this.app, file, this.settings, cmd.variant).catch((e) => console.error("Rollup to PDF failed:", e));
					}
					return true;
				},
			});
		}
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<RollupSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
