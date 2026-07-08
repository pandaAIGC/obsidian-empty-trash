import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
} from "obsidian";

interface EmptyTrashSettings {
  confirmBeforeEmpty: boolean;
  showRibbonIcon: boolean;
}

interface TrashItems {
  files: string[];
  folders: string[];
}

type PersistedSettings = Partial<Record<keyof EmptyTrashSettings, unknown>>;

const DEFAULT_SETTINGS: EmptyTrashSettings = {
  confirmBeforeEmpty: true,
  showRibbonIcon: true,
};

const TRASH_PATH = ".trash";

export default class EmptyTrashPlugin extends Plugin {
  settings: EmptyTrashSettings = DEFAULT_SETTINGS;
  private ribbonIconEl?: HTMLElement;
  private isEmptying = false;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "empty-obsidian-trash",
      name: "Empty Obsidian trash",
      callback: () => {
        void this.emptyTrash();
      },
    });

    this.addSettingTab(new EmptyTrashSettingTab(this.app, this));
    this.refreshRibbonIcon();
  }

  onunload() {
    this.removeRibbonIcon();
  }

  async loadSettings() {
    const loaded = (await this.loadData()) as unknown;
    this.settings = normalizeSettings(loaded);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  refreshRibbonIcon() {
    this.removeRibbonIcon();

    if (!this.settings.showRibbonIcon) {
      return;
    }

    this.ribbonIconEl = this.addRibbonIcon(
      "eraser",
      "Empty Obsidian trash",
      () => {
        void this.emptyTrash();
      },
    );
  }

  private removeRibbonIcon() {
    this.ribbonIconEl?.remove();
    this.ribbonIconEl = undefined;
  }

  private async emptyTrash() {
    if (this.isEmptying) {
      new Notice("Empty Trash is already running.");
      return;
    }

    const adapter = this.app.vault.adapter;
    const trashExists = await adapter.exists(TRASH_PATH);

    if (!trashExists) {
      new Notice("Obsidian trash is already empty.");
      return;
    }

    const items = await this.collectTrashItems(TRASH_PATH);

    if (items.files.length === 0 && items.folders.length === 0) {
      new Notice("Obsidian trash is already empty.");
      return;
    }

    if (this.settings.confirmBeforeEmpty) {
      const confirmed = await this.confirmEmptyTrash(items);

      if (!confirmed) {
        new Notice("Empty trash cancelled.");
        return;
      }
    }

    this.isEmptying = true;

    try {
      const result = await this.deleteTrashItems(items);

      if (result.failures.length > 0) {
        new Notice(
          `Deleted ${result.deletedFiles} file(s) and ${result.deletedFolders} folder(s). ${result.failures.length} item(s) failed.`,
          8000,
        );
        console.warn("Empty Trash failures", result.failures);
        return;
      }

      new Notice(
        `Deleted ${result.deletedFiles} file(s) and ${result.deletedFolders} folder(s) from Obsidian trash.`,
      );
    } finally {
      this.isEmptying = false;
    }
  }

  private async collectTrashItems(folderPath: string): Promise<TrashItems> {
    const adapter = this.app.vault.adapter;
    const listed = await adapter.list(folderPath);
    const items: TrashItems = {
      files: listed.files.map((filePath) => normalizePath(filePath)),
      folders: [],
    };

    for (const childFolder of listed.folders) {
      const normalizedFolder = normalizePath(childFolder);
      const childItems = await this.collectTrashItems(normalizedFolder);

      items.folders.push(normalizedFolder, ...childItems.folders);
      items.files.push(...childItems.files);
    }

    return items;
  }

  private async deleteTrashItems(items: TrashItems) {
    const adapter = this.app.vault.adapter;
    let deletedFiles = 0;
    let deletedFolders = 0;
    const failures: string[] = [];

    for (const filePath of items.files) {
      try {
        await adapter.remove(filePath);
        deletedFiles += 1;
      } catch (error) {
        failures.push(`${filePath}: ${String(error)}`);
      }
    }

    const deepestFoldersFirst = [...items.folders].sort(
      (left, right) => right.split("/").length - left.split("/").length,
    );

    for (const folderPath of deepestFoldersFirst) {
      try {
        await adapter.rmdir(folderPath, false);
        deletedFolders += 1;
      } catch (error) {
        failures.push(`${folderPath}: ${String(error)}`);
      }
    }

    return {
      deletedFiles,
      deletedFolders,
      failures,
    };
  }

  private confirmEmptyTrash(items: TrashItems): Promise<boolean> {
    return new Promise((resolve) => {
      new EmptyTrashConfirmModal(this.app, items, resolve).open();
    });
  }
}

function normalizeSettings(data: unknown): EmptyTrashSettings {
  if (!data || typeof data !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const persisted = data as PersistedSettings;

  return {
    confirmBeforeEmpty:
      typeof persisted.confirmBeforeEmpty === "boolean"
        ? persisted.confirmBeforeEmpty
        : DEFAULT_SETTINGS.confirmBeforeEmpty,
    showRibbonIcon:
      typeof persisted.showRibbonIcon === "boolean"
        ? persisted.showRibbonIcon
        : DEFAULT_SETTINGS.showRibbonIcon,
  };
}

class EmptyTrashConfirmModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly items: TrashItems,
    private readonly resolve: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen() {
    this.titleEl.setText("Empty Obsidian trash?");
    this.contentEl.createEl("p", {
      text: `This will permanently delete ${this.items.files.length} file(s) and ${this.items.folders.length} folder(s) from .trash.`,
    });
    this.contentEl.createEl("p", {
      text: "This cannot be undone through Obsidian.",
    });

    const buttonRow = this.contentEl.createDiv({
      cls: "empty-trash-modal-buttons",
    });

    const cancelButton = buttonRow.createEl("button", {
      text: "Cancel",
    });
    cancelButton.addEventListener("click", () => {
      this.closeWith(false);
    });

    const confirmButton = buttonRow.createEl("button", {
      text: "Empty trash",
      cls: "mod-warning",
    });
    confirmButton.addEventListener("click", () => {
      this.closeWith(true);
    });
    confirmButton.focus();
  }

  onClose() {
    this.contentEl.empty();

    if (!this.resolved) {
      this.resolve(false);
    }
  }

  private closeWith(confirmed: boolean) {
    this.resolved = true;
    this.resolve(confirmed);
    this.close();
  }
}

class EmptyTrashSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: EmptyTrashPlugin,
  ) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Ask before emptying trash")
      .setDesc("Show one confirmation dialog before permanently deleting .trash contents.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.confirmBeforeEmpty)
          .onChange(async (value) => {
            this.plugin.settings.confirmBeforeEmpty = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Show ribbon icon")
      .setDesc("Add an eraser icon to the left ribbon for one-click access.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIcon)
          .onChange(async (value) => {
            this.plugin.settings.showRibbonIcon = value;
            await this.plugin.saveSettings();
            this.plugin.refreshRibbonIcon();
          }),
      );
  }
}
