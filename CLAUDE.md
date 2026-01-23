# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

chkd is a development workflow tool that tracks tasks in a spec file (`docs/SPEC.md`) and helps Claude build them systematically. It provides a dashboard UI, CLI commands, and MCP tools to keep Claude focused on planned work.

## Philosophy: Why chkd Exists

**The problem:** Humans want to let AI run at 100mph, and AI wants to comply. Both have the same bias: go fast, skip steps, batch everything.

**The solution:** chkd is a collaboration contract between human and AI.

| Without chkd | With chkd |
|--------------|-----------|
| Human: "Build SD.13" | Human: "Build SD.13" |
| AI: builds 10 things in one go | AI: "Working on SD.13.1" → tick → "Working on SD.13.2"... |
| 3 features missing, no one notices | Forced pause at each step |

**The constraint applies to both parties:**
- Human can't say "just do it all" - the tool doesn't work that way
- AI can't batch work - the workflow demands tick-by-tick progress

**At each checkpoint:**
1. AI shows what it did
2. Human confirms or redirects
3. Then next step

Neither party can skip this. The tool enforces it.

**Simple statement:** chkd exists to slow down both human and AI to the speed of good work. Tick. Verify. Tick. Verify. Same rules for both.

## MCP Tools (PREFERRED - Use These!)

When the chkd MCP server is connected, **use these tools instead of CLI**:

| Tool | What it does |
|------|--------------|
| `chkd_status` | Get current state - run this first! |
| `chkd_checkin` | 15-minute check-in - how are we doing? |
| `chkd_pulse` | Quick status update, resets check-in timer |
| `chkd_suggest` | Analyze spec, suggest what to work on |
| `chkd_working` | Signal starting a sub-item |
| `chkd_tick` | Mark item complete |
| `chkd_bug` | Log a bug (don't derail, log and continue) |
| `chkd_bugfix` | Start working on a bug |
| `chkd_fix` | Signal fix ready for verification |
| `chkd_resolve` | Close bug after user verified |
| `chkd_impromptu` | Start ad-hoc work session |
| `chkd_debug` | Start investigation session |
| `chkd_done` | End current session |
| `chkd_pivot` | Change anchor/focus explicitly |

**Resources** (read these for context):
- `chkd://conscience` - Session state, anchor, guidance, habits
- `chkd://spec` - Current spec with progress

### CRITICAL: Never Code While IDLE

**BEFORE writing ANY code, check:** `chkd_status` or read `chkd://conscience`

If status is IDLE:
- **Stop!** Don't write code yet.
- Start a session first:
  - `chkd_impromptu("what I'm doing")` - for ad-hoc work
  - `chkd_debug("what I'm investigating")` - for research
  - `chkd_bugfix("bug")` - for bug fixes

**The UI should NEVER show IDLE while you're coding.**

### Automatic Behaviors

1. **Check status BEFORE coding** - If IDLE, start a session first!
2. **Check-in every 15 min** - When nudged, call `chkd_checkin`
3. **Stay on anchor** - If off-track warning appears, return to anchor or `chkd_pivot`
4. **Tick as you go** - Call `chkd_tick` immediately after completing sub-items
5. **Log bugs immediately** - `chkd_bug("description")` then continue your work

## CLI Commands (Fallback)

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
chkd bugfix "bug"        # Start bugfix (align with user first)
chkd fix "bug"           # Signal fix ready (get verification)
chkd resolve "bug"       # Close bug after user verified

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
npm run dev              # Start dev server on port 3847
npm run build            # Build for production
npm run check            # TypeScript type checking
npm run mcp              # Run MCP server directly
npm run stable:build     # Build snapshot to build-stable/
npm run stable           # Run stable build on port 3848
```

**Running stable version:** When developing chkd itself, use `npm run stable` on port 3848 to avoid hot reloads interrupting your work.

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
# ... ACTUALLY BUILD IT ...     # 2. Do the work!
chkd tick "sub-item title"      # 3. Mark done (10s minimum after working)
```

**⛔ NEVER chain commands:**
```bash
chkd working "item" && chkd tick "item"  # BLOCKED - 10 second minimum enforced
```

**Feedback items require explicit user approval** - wait for "yes"/"approved" before ticking.

**If not following chkd rules:** Re-read this CLAUDE.md and respect ALL instructions.
