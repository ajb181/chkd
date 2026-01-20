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
1. `chkd status` - See what's next
2. Pick a task (e.g., SD.1)
3. `/chkd SD.1` - Build it
4. Review and iterate

### Sub-Item Workflow (IMPORTANT!)

For tasks with sub-items, **tick as you go**:

```bash
# For EACH sub-item:
chkd working "sub-item title"   # 1. Signal start
# ... build it ...
chkd tick "sub-item title"      # 2. Mark done immediately
```

**Don't batch ticks at the end!** This keeps progress visible and accurate.
