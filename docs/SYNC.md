# chkd Sync System

How chkd distributes updates to other projects.

---

## Overview

chkd can sync its skills, documentation, and templates to other projects that use the chkd workflow. This ensures all your Claude instances have the latest workflow instructions.

**Key concept**: chkd-v2 is the source. Other projects receive synced files.

---

## What Gets Synced

Defined in `chkd-sync.json`:

| Asset | Source | Destination | Mode |
|-------|--------|-------------|------|
| skills | `templates/skills/` | `.claude/skills/` | copy |
| claude-section | `templates/CLAUDE-chkd-section.md` | `CLAUDE.md` | merge |
| guide | `templates/docs/GUIDE.md` | `docs/GUIDE.md` | copy |
| cli-reference | `templates/docs/CLI.md` | `docs/CLI.md` | copy |
| spec-template | `templates/docs/SPEC.md.template` | `docs/SPEC.md` | init-only |
| claude-template | `templates/CLAUDE.md.template` | `CLAUDE.md` | init-only |

### Sync Modes

- **copy**: Replace destination with source (overwrites)
- **merge**: Intelligently merge (manual for now, would use LLM)
- **init-only**: Only copy if destination doesn't exist

---

## Commands

```bash
# Sync skills to current project
chkd sync skills

# Sync to ALL registered repos
chkd sync all

# Check sync status
chkd sync
```

---

## Version Tracking

Each synced project gets a `.chkd-version` file containing the version number (e.g., `0.2.0`). This comes from `chkd-sync.json`.

To check if a project is out of date:
1. Read its `.chkd-version`
2. Compare with `chkd-sync.json` version
3. If different, run `chkd sync skills`

---

## Files Involved

When working on the sync system, these files matter:

| File | Purpose |
|------|---------|
| `chkd-sync.json` | Manifest - what to sync and how |
| `src/cli/index.ts` | Sync command implementation (~line 108-286) |
| `templates/skills/*` | Skills that get synced to `.claude/skills/` |
| `templates/docs/*` | Docs that get synced |
| `templates/CLAUDE-chkd-section.md` | CLAUDE.md section for merge |
| `templates/CLAUDE.md.template` | Full CLAUDE.md for new projects |

---

## How It Works

### `chkd sync skills`

1. Reads `chkd-sync.json` from chkd root
2. For each asset:
   - **init-only**: Skip if destination exists
   - **merge**: Skip (manual for now)
   - **copy**: Copy file or directory
3. Writes `.chkd-version` to project

### `chkd sync all`

1. Gets all registered repos from API
2. For each repo (except current):
   - Changes to that directory
   - Runs `sync skills`
3. Changes back to original directory

---

## Adding New Syncable Content

1. Put the file in `templates/`
2. Add entry to `chkd-sync.json`:
   ```json
   {
     "name": "my-asset",
     "source": "templates/my-asset",
     "destination": ".target/path",
     "mode": "copy"
   }
   ```
3. Run `chkd sync all` to distribute

---

## Conflict Handling

The sync command detects and handles conflicts:

### Copy Mode
- **Detects** when local file differs from source
- **Overwrites** local changes (warns you)
- Output: `✓ Synced guide (overwrote local changes)`

### Merge Mode
- **Detects** when local file differs from source
- **Skips** the file to preserve your customizations
- Output: `⚠ Skipped claude-section (merge mode - has local changes)`
- You need to merge manually

### Summary
If any conflicts occurred, you'll see:
```
⚠ Some local changes were overwritten or skipped.
  Project customizations in 'copy' mode files are overwritten.
  Files in 'merge' mode keep local changes (sync manually).
```

---

## Future Improvements

- **Version comparison**: Check if update needed before syncing
- **Auto-sync**: Trigger on npm update or git hook
