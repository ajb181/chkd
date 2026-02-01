# chkd Development Guide

> Keep Claude on-plan. Track what gets built.

---

## What is chkd?

chkd helps you build software with Claude Code without losing control:

1. **Spec-driven** - Your features live in the database, visible in UI
2. **Progress tracking** - See what's done, in progress, blocked
3. **Keeps Claude focused** - Builds what you planned, logs surprises
4. **MCP integration** - Claude gets context automatically

---

## The Problem chkd Solves

It's not just "Claude forgets to verify."

**It's: Humans want to let AI run at 100mph, and AI wants to comply.**

Both parties have the same bias: go fast, skip steps, batch everything, "just get it done."

The workflow is a forcing function for both.

### Same Discipline, Both Parties

| Without chkd | With chkd |
|--------------|-----------|
| Human: "Build SD.13" | Human: "Build SD.13" |
| AI: builds 10 things in one go | AI: `working("SD.13.1")` |
| Human: "Looks done!" | AI: "Done." `tick("SD.13.1")` |
| 3 features missing, no one notices | Human: "Ok, next" |
| | AI: `working("SD.13.2")` |
| | *forced pause at each step* |

The human can't say "just do it all" because the tool doesn't work that way. The AI can't batch because the workflow demands tick-by-tick progress.

**The constraint applies to both.**

### The Philosophy

**chkd is a collaboration contract between human and AI.**

It forces checkpoints where both parties must align:
- AI shows what it did
- Human confirms or redirects
- Then next step

Neither party can skip this. The tool enforces it.

**chkd exists to slow down both human and AI to the speed of good work.**

Tick. Verify. Tick. Verify.

Same rules for both.

---

## Quick Start

### 1. Start the chkd server

```bash
cd ~/chkd && npm run dev
```

Server runs at `http://localhost:3847`. Keep this terminal open.

### 2. Register the MCP Server

Register chkd as a global MCP server:

```bash
claude mcp add --scope user chkd -- npx tsx ~/chkd/src/mcp/server-http.ts
```

Verify it's working:

```bash
claude mcp list
```

### 3. Sync your project

Open Claude Code in your project:

```bash
cd ~/my-project
claude
```

Then run the sync tool:

```
sync()
```

This:
- Registers the project with chkd
- Creates/updates `CLAUDE.md` with chkd section
- Copies guide files to `docs/`

### 4. Add a feature

```
add("Login page", areaCode="FE")
```

This creates a task with workflow steps:
- Explore → Design → Prototype → Wire-up → Feedback → Polish → Document → Commit

### 5. Build it

```
working("FE.1")
```

Then tick each step as you complete it:

```
tick("Explore")
tick("Design")
...
```

---

## MCP Tools

### Core Workflow

| Tool | What it does |
|------|--------------|
| `sync()` | Register project, sync CLAUDE.md and docs |
| `status()` | See current state - **run this first!** |
| `working(item)` | Signal starting work on an item |
| `tick(item)` | Mark item complete |
| `done()` | End current session |

### Spec Management

| Tool | What it does |
|------|--------------|
| `add(title, areaCode)` | Add feature with workflow sub-tasks |
| `add_child(parentId, title)` | Add sub-task to existing item |
| `add_task(title)` | Add sub-task to current working item |
| `tag(itemId, tags)` | Set tags on an item |
| `list(type?, area?, status?)` | List items with filters |

### Quick Wins

| Tool | What it does |
|------|--------------|
| `CreateQuickWin(title, files, test)` | Add quick fix with planning |
| `ListQuickWins()` | List all quick wins |
| `CompleteQuickWin(id)` | Mark quick win done |

### Sessions

| Tool | What it does |
|------|--------------|
| `impromptu(description)` | Start ad-hoc work session |

### Epics

| Tool | What it does |
|------|--------------|
| `epic(name, description)` | Create epic for large features |
| `epics()` | List all epics with progress |

### Utilities

| Tool | What it does |
|------|--------------|
| `upgrade_mcp()` | Check server version, get upgrade instructions |
| `attach(itemType, itemId, filePath)` | Attach file to item |
| `attachments(itemType?, itemId?)` | List attachments |

### Resources

Claude reads these automatically for context:
- `chkd://conscience` - Session state, guidance, habits
- `chkd://spec` - Current spec with progress

---

## Spec Format

Features are stored in the database, but follow this structure:

```
FE.1 Login page
├── FE.1.1 Explore
├── FE.1.2 Design  
├── FE.1.3 Prototype
├── FE.1.4 Wire-up
├── FE.1.5 Feedback
├── FE.1.6 Polish
├── FE.1.7 Document
└── FE.1.8 Commit
```

**Area codes:** FE (Frontend), BE (Backend), SD (System Design), FUT (Future/Quick)

---

## Workflow Types

| Type | Steps | Use for |
|------|-------|---------|
| `default` | 8 steps | Normal features |
| `quickwin` | 5 steps | Small fixes (<30 min) |
| `refactor` | 7 steps | Code cleanup (no behavior change) |
| `debug` | 6 steps | Bug investigation |
| `audit` | 5 steps | Investigation only |
| `remove` | 5 steps | Deleting code |

---

## Staying Focused

When working on a task:

1. **Small fix?** → `CreateQuickWin()` then continue
2. **Want to refactor?** → Log it, don't do it now
3. **Something seems off?** → Note it, stay on track

Quick wins exist so nothing gets lost. Fix them later.

---

## Epics (Large Features)

For features that span multiple spec items:

```
epic("Auth Overhaul", "Complete authentication rewrite")
```

Creates `docs/epics/auth-overhaul.md` with:
- Overview and goals
- Scope checklist
- Tag for linking items

Link items to epic:

```
add("Login API", areaCode="BE", epic="auth-overhaul")
tag("BE.3", ["auth-overhaul"])
```

Track progress:

```
epics()
```

---

## Multi-Worker System

Run multiple Claude instances in parallel. One "Manager" coordinates while "Workers" execute on separate branches.

### When to Use

**Good for:**
- Independent tasks (FE while you do BE)
- Parallel features that don't overlap

**Avoid when:**
- Tasks modify same files
- Deep dependencies between tasks

### Manager Commands

| Tool | What it does |
|------|--------------|
| `spawn_worker(taskId, taskTitle)` | Create new worker |
| `workers()` | List active workers |
| `merge_worker(workerId)` | Merge worker's branch |
| `pause_worker(workerId)` | Pause a worker |
| `resume_worker(workerId)` | Resume paused worker |
| `stop_worker(workerId)` | Cancel and cleanup |
| `dead_workers()` | Find stuck workers |

### Worker Commands

| Tool | What it does |
|------|--------------|
| `worker_heartbeat(id, msg, %)` | Report progress |
| `worker_complete(id, summary)` | Signal task done |
| `worker_status(id)` | Check for instructions |

---

## Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Instructions for Claude |
| `docs/GUIDE.md` | This guide |
| `docs/PHILOSOPHY.md` | Why chkd exists |
| `docs/FILING.md` | Code organization guide |
| `docs/epics/` | Epic definitions |
| `docs/attachments/` | File attachments |

---

## Troubleshooting

**"Cannot connect to chkd"**
```bash
cd ~/chkd && npm run dev
```

**MCP tools not showing**
- Check: `claude mcp list`
- Restart Claude Code after config changes

**Project not registered**
- Run `sync()` in the project

---

## UI

Dashboard: `http://localhost:3847`
