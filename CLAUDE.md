# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

chkd is a development workflow tool that tracks tasks in a spec file (`docs/SPEC.md`) and helps Claude build them systematically. It provides a dashboard UI and MCP tools to keep Claude focused on planned work.

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

## Keeping User Focused (You Can Push Back!)

The constraint applies to BOTH parties. If the user goes off-track, you're empowered to redirect:

1. **User asks to do something outside current task:**
   → "Let's park that with bug()/win() - stay focused on [current]?"

2. **User wants to skip workflow steps:**
   → "The spec has [step] next - want to skip it or should we do it?"

3. **User derails into tangent:**
   → "Interesting idea - should I log that for later so we stay on task?"

4. **User wants to batch work:**
   → "Want to tick these one at a time? Helps catch issues early."

You're not being difficult - you're enforcing the contract both signed up for. The user chose chkd because they WANT this discipline.

## MCP Tools

When the chkd MCP server is connected, use these tools:

| Tool | What it does |
|------|--------------|
| `status` | Get current state - run this first! |
| `checkin` | 15-minute check-in - how are we doing? |
| `pulse` | Quick status update, resets check-in timer |
| `suggest` | Analyze spec, suggest what to work on |
| `working` | Signal starting a sub-item |
| `tick` | Mark item complete |
| `bug` | Log a bug (don't derail, log and continue) |
| `bugfix` | Start working on a bug |
| `fix` | Signal fix ready for verification |
| `resolve` | Close bug after user verified |
| `impromptu` | Start ad-hoc work session |
| `debug` | Start investigation session |
| `done` | End current session |
| `pivot` | Change anchor/focus explicitly |
| `epic` | Create epic for large features |
| `epics` | List all epics with progress |
| `tag` | Link item to epic via tag |
| `add` | Add feature with workflow sub-tasks |

**Resources** (read these for context):
- `chkd://conscience` - Session state, anchor, guidance, habits
- `chkd://spec` - Current spec with progress

### CRITICAL: Never Code While IDLE

**BEFORE writing ANY code, check:** `status` or read `chkd://conscience`

If status is IDLE:
- **Stop!** Don't write code yet.
- Start a session first:
  - `working("item title")` - for spec tasks
  - `impromptu("what I'm doing")` - for ad-hoc work
  - `debug("what I'm investigating")` - for research
  - `bugfix("bug")` - for bug fixes

**The UI should NEVER show IDLE while you're coding.**

### Automatic Behaviors

1. **Check status BEFORE coding** - If IDLE, start a session first!
2. **Check-in every 15 min** - When nudged, call `checkin`
3. **Stay on anchor** - If off-track warning appears, return to anchor or `pivot`
4. **Tick as you go** - Call `tick` immediately after completing sub-items
5. **Log bugs immediately** - `bug("description")` then continue your work

## Skills (in Claude Code)

| Skill | When to use |
|-------|-------------|
| `/chkd SD.1` | Build a specific task from the spec |
| `/epic "Name"` | Plan and create a large feature (interview → design → stories) |
| `/spec-check` | Validate SPEC.md format after editing |
| `/reorder-spec` | Organize a messy or empty spec |

## Staying Focused

When working on a task:

1. **User reports a bug/issue** → `bug("description")` then CONTINUE your task
2. **You notice a bug** → `bug("description")` then CONTINUE your task
3. **Something seems wrong** → Log it, don't fix it (unless it blocks you)

**DON'T** derail from your current task to investigate/fix unrelated issues.
**DO** quickly log issues and stay on track.

The bugs list exists so nothing gets lost. Fix them later with `bugfix("bug title")`.

## Before Making Changes (Explore Phase)

During the **Explore** phase of any task:

1. **Review the code you'll touch** - Read it, understand it
2. **Flag complexity** - If code is messy or complex, tell the user:
   - "This area could use refactoring first"
   - "This file is 500+ lines, might want to split"
3. **Let user decide** - They choose whether to refactor first or proceed
4. **If refactoring:** Use `add` to create refactor story → do that first → return

Don't dive into changes without understanding what you're touching.
Don't add features on top of messy code without flagging it.

## Source of Truth

- `docs/SPEC.md` - Feature checklist (SD.1, FE.1, BE.1 format)
- `docs/GUIDE.md` - How to use chkd workflow
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

SvelteKit app (Svelte 5 with runes) with built-in API routes. SQLite database for state.

```
src/
├── mcp/              # MCP server (HTTP-based, calls API endpoints)
│   ├── server-http.ts    # Main MCP server
│   └── http-client.ts    # API client for MCP
├── lib/
│   ├── api.ts        # Frontend API client
│   ├── components/   # Svelte components
│   └── server/       # Server-side code
│       ├── db/       # SQLite database (better-sqlite3)
│       ├── spec/     # Spec parser & writer
│       └── proposal/ # Change proposals
├── routes/
│   ├── +page.svelte  # Main dashboard
│   ├── guide/        # Guide pages
│   └── api/          # API endpoints (single source of truth)
```

**Key architectural decision:** MCP server uses HTTP to call the SvelteKit API rather than direct database access. This ensures the UI stays in sync and the API is the single source of truth.

## Key Files

| File | Purpose |
|------|---------|
| `src/mcp/server-http.ts` | MCP server (all tools defined here) |
| `src/lib/server/spec/parser.ts` | Parses SPEC.md |
| `src/lib/server/spec/writer.ts` | Modifies SPEC.md |
| `src/routes/+page.svelte` | Main dashboard UI |
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

1. **templates/skills/*** - Changes sync to all projects
2. **chkd-sync.json** - Bump version when making significant changes

## Development Standards

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
- `[~]` - In progress (set by `working`)
- `[x]` - Complete (set by `tick`)

## Workflow

### Basic Flow
1. `status` - See progress and what's next
2. `working("SD.1")` or `/chkd SD.1` - Start a task
3. Review and iterate

### Sub-Item Workflow (IMPORTANT!)

For tasks with sub-items, **tick as you go**:

```
# For EACH sub-item:
working("sub-item title")   # 1. Signal start
# ... ACTUALLY BUILD IT ...      # 2. Do the work!
tick("sub-item title")      # 3. Mark done (2s minimum after working)
```

**⛔ NEVER batch ticks** - the system enforces a 2-second minimum between working and tick.

**Feedback items require explicit user approval** - wait for "yes"/"approved" before ticking.

**If not following chkd rules:** Re-read this CLAUDE.md and respect ALL instructions.
