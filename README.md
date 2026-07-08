# Empty Trash

Empty Trash is a small Obsidian plugin that permanently removes every item inside the vault's `.trash` folder with one command.

## Why

Obsidian can move deleted files to a hidden `.trash` folder. This plugin adds a direct way to empty that folder without deleting files one by one.

## Usage

1. Set Obsidian's deleted-file behavior to use Obsidian trash: `Settings -> Files and links -> Deleted files -> Move to Obsidian trash`.
2. Run `Empty Trash: Empty Obsidian trash` from the command palette, or click the trash icon in the ribbon.
3. Confirm once to permanently delete all files and folders currently inside `.trash`.

## Notes

- This plugin only clears the vault-local `.trash` folder.
- It does not clear the operating system trash.
- Permanent deletion cannot be undone through Obsidian, so keep backups or sync history enabled.

## Development

```bash
npm install
npm run dev
npm run build
```
