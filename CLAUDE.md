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

# Ad-hoc Work (keeps UI engaged)
chkd impromptu "desc"    # Start ad-hoc work not in spec
chkd debug "desc"        # Start debug/investigation session

# Adding Features
chkd add "title"              # Add feature with workflow sub-tasks
chkd add "title" --story "x"  # Add with story/description
chkd add "title" --area FE    # Specify area (SD, FE, BE, FUT)
chkd edit "SD.1" --story "x"  # Update existing item's story

# Bugs
chkd bug "description"   # Quick-create a bug
chkd bugs                # List open bugs
chkd fix "bug"           # Mark bug as fixed

# Quick Wins
chkd win "title"         # Add a quick win
chkd wins                # List quick wins
chkd won "query"         # Complete a quick win

# Help
chkd help [command]      # Get detailed help
```

### Skills (in Claude Code)
- `/chkd SD.1` - Build a specific task from the spec
- `/story` - Refine specs, plan features
- `/bugfix` - Fix bugs with minimal changes (research first!)
- `/commit` - Safe commit workflow
- `/retro` - Capture learnings after fixing bugs

## Keep the UI Engaged (IMPORTANT!)

**Before writing any code, ask yourself:** Am I in a session?

- **Working on a spec task?** → Use `/chkd SD.1` (starts session automatically)
- **Doing ad-hoc work not in spec?** → Run `chkd impromptu "what I'm doing"` FIRST
- **Debugging something?** → Run `chkd debug "what I'm investigating"` FIRST

**The UI should NEVER show "IDLE" while you're coding.** If it does, start a session!

```bash
chkd status              # Check current state
chkd impromptu "desc"    # Start ad-hoc session
chkd debug "desc"        # Start debug session
chkd done                # End session when finished
```

## Staying Focused

When working on a task:

1. **User reports a bug/issue** → `chkd bug "description"` then CONTINUE your task
2. **You notice a bug** → `chkd bug "description"` then CONTINUE your task
3. **Something seems wrong** → Log it, don't fix it (unless it blocks you)

**DON'T** derail from your current task to investigate/fix unrelated issues.
**DO** quickly log issues and stay on track.

The bugs list exists so nothing gets lost. Fix them later with `/bugfix`.

## Before Making Changes (Explore Phase)

During the **Explore** phase of any task:

1. **Review the code you'll touch** - Read it, understand it
2. **Flag complexity** - If code is messy or complex, tell the user:
   - "This area could use refactoring first"
   - "This file is 500+ lines, might want to split"
3. **Let user decide** - They choose whether to refactor first or proceed
4. **If refactoring:** `chkd pause` → create refactor story → do that first → return

Don't dive into changes without understanding what you're touching.
Don't add features on top of messy code without flagging it.

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
