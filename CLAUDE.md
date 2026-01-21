# CLAUDE.md - chkd-v2

## Project Overview

chkd-v2 is a lightweight development workflow tool. It tracks tasks in a spec file and helps Claude build them systematically.

## CLI Commands (USE THESE!)

**Full reference:** See `docs/CLI.md` for complete documentation.

### Quick Reference
```bash
# Status
chkd status              # ALWAYS run first - see progress & current task
chkd progress            # See current task's sub-items

# Building (tick as you go!)
chkd working "item"      # Signal you're starting an item
chkd tick "item"         # Mark item complete

# Bugs
chkd bug "description"   # Quick-create a bug
chkd bugs                # List open bugs
chkd fix "bug"           # Mark bug as fixed

# Help
chkd help [command]      # Get detailed help
```

### Skills (in Claude Code)
- `/chkd SD.1` - Build a specific task from the spec
- `/story` - Refine specs, plan features
- `/bugfix` - Fix bugs with minimal changes (research first!)
- `/commit` - Safe commit workflow
- `/retro` - Capture learnings after fixing bugs

## Staying Focused (IMPORTANT!)

When working on a task:

1. **User reports a bug/issue** → `chkd bug "description"` then CONTINUE your task
2. **You notice a bug** → `chkd bug "description"` then CONTINUE your task
3. **Something seems wrong** → Log it, don't fix it (unless it blocks you)

**DON'T** derail from your current task to investigate/fix unrelated issues.
**DO** quickly log issues and stay on track.

The bugs list exists so nothing gets lost. Fix them later with `/bugfix`.

## Source of Truth

- `docs/SPEC.md` - Feature checklist (SD.1, FE.1, BE.1 format)
- `docs/GUIDE.md` - How to use chkd workflow
- `docs/CLI.md` - Complete CLI reference
- This file - Instructions for Claude

## Development Commands

```bash
# Start dev server (runs on port 3847, or next available)
npm run dev

# Build for production
npm run build
```

## Architecture

SvelteKit app with built-in API routes (no separate daemon).

```
src/
├── cli/              # CLI tool (chkd command)
├── lib/
│   ├── api.ts        # Frontend API client
│   ├── components/   # Svelte components
│   └── server/       # Server-side code
│       ├── db/       # SQLite database
│       ├── spec/     # Spec parser & writer
│       └── proposal/ # Change proposals
├── routes/
│   ├── +page.svelte  # Main dashboard
│   ├── guide/        # Guide page
│   └── api/          # API endpoints
```

## Key Files

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | CLI commands |
| `src/lib/server/spec/parser.ts` | Parses SPEC.md |
| `src/lib/server/spec/writer.ts` | Modifies SPEC.md |
| `src/routes/+page.svelte` | Main UI |
| `docs/SPEC.md` | The task list |

## Sync System

chkd syncs skills and docs to other projects. See `docs/SYNC.md` for full details.

### Sync Files (be careful editing these!)

| File | Purpose |
|------|---------|
| `chkd-sync.json` | Manifest - what gets synced and how |
| `templates/skills/*` | Skills synced to `.claude/skills/` |
| `templates/docs/*` | Docs synced to `docs/` |
| `templates/CLAUDE-chkd-section.md` | CLAUDE.md section for merge |
| `templates/CLAUDE.md.template` | Full CLAUDE.md for new projects |
| `templates/docs/SPEC.md.template` | SPEC.md for new projects |

### When Editing Sync Files

1. **templates/skills/*** - Changes sync to all projects on `chkd sync all`
2. **chkd-sync.json** - Bump version when making significant changes
3. **After changes** - Run `chkd sync all` to distribute

### Commands

```bash
chkd sync skills   # Sync skills to current project
chkd sync all      # Sync to ALL registered repos
```

## Development Standards

### CLI Commands

When adding or editing CLI commands, follow the checklist in `docs/CLI-QUALITY.md`:

1. **Function**: Validate args, handle errors with hints, use consistent output format
2. **Help text**: Add entry in `showCommandHelp()` with examples and use cases
3. **Documentation**: Update `docs/CLI.md` with command reference
4. **Main**: Add to switch statement and help() list
5. **Test**: Verify help, no-args, normal case, and error handling

### API Endpoints

- Return `{ success, data?, error?, hint? }` format
- Validate required params early
- Return warnings for unknown parameters
- Support dry-run mode for destructive operations
- Check for duplicates before creating

## Spec Format

Items must have section numbers:
```markdown
- [ ] **SD.1 Feature Name** - Description
  - [ ] Sub-task
```

**Areas:** SD (Site Design), FE (Frontend), BE (Backend), FUT (Future)

**Spec Markers:**
- `[ ]` - Not started
- `[~]` - In progress (set by `chkd working`)
- `[x]` - Complete (set by `chkd tick`)

## Workflow

### Basic Flow
1. `chkd status` - See progress and what's next
2. `/chkd SD.1` - Build a task (use task ID from spec)
3. Review and iterate

### Sub-Item Workflow (IMPORTANT!)

For tasks with sub-items, **tick as you go**:

```bash
# For EACH sub-item:
chkd working "sub-item title"   # 1. Signal start
# ... build it ...
chkd tick "sub-item title"      # 2. Mark done immediately
```

**Don't batch ticks at the end!** This keeps progress visible and accurate.
