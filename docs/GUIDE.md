# chkd Development Guide

> Keep Claude on-plan. Track what gets built.

---

## What is chkd?

chkd helps you build software with Claude Code without losing control:

1. **Spec-driven** - Your features are stored in a local database (viewable via UI/MCP)
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
| AI: builds 10 things in one go | AI: "Working on SD.13.1" |
| Human: "Looks done!" | AI: "Done. Ticking SD.13.1" |
| 3 features missing, no one notices | Human: "Ok, next" |
| | AI: "Working on SD.13.2..." |
| | *forced pause at each step* |

The human can't say "just do it all" because the tool doesn't work that way. The AI can't batch because the workflow demands tick-by-tick progress.

**The constraint applies to both.**

### Human Nature + AI Nature

**Human nature:**
- "Let it run, I'll review at the end"
- "I trust the AI, it's probably fine"
- "Faster is better"
- "Checking each step is tedious"

**AI nature:**
- "I'll do everything you asked"
- "I'll optimize for completion"
- "I won't stop to verify unless told"
- "I'll make assumptions to keep moving"

Both want the same thing: **Speed without friction.**

chkd says: No. Tick. Verify. Tick. Verify.

### The Philosophy

**chkd is a collaboration contract between human and AI.**

It forces checkpoints where both parties must align:
- AI shows what it did
- Human confirms or redirects
- Then next step

Neither party can skip this. The tool enforces it.

### What This Means for the Workflow

The Verify step isn't just for Claude. It's a handoff point:

```
- [ ] Build: implement the thing
- [ ] Verify: compare to spec, iterate if gaps  ← HUMAN + AI checkpoint
- [ ] Commit: what was built + assumptions
```

At "Verify":
- AI shows the work
- Human looks at it (or AI describes what to look at)
- Gap found? Iterate before moving on
- No gap? Tick, commit, continue

**Neither party can skip the checkpoint. That's the point.**

### The Commit Is Also a Contract

The commit message with assumptions isn't just documentation. It's:

1. **AI declares:** "Here's what I built, here's what I assumed"
2. **Human sees:** The assumptions, the gaps noted
3. **Both agree:** This is done, move on

If human doesn't like the assumptions, they stop. If AI skipped something, it's visible.

### Simple Statement

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

Register chkd as a global MCP server so it's available in all projects:

```bash
claude mcp add --scope user chkd -- npx tsx ~/chkd/src/mcp/server-http.ts
```

The `--scope user` flag makes chkd available in all projects, including git worktrees for parallel development.

Verify it's working:

```bash
claude mcp list
```

### 3. Add chkd to your project

```bash
cd ~/my-project
git init  # if not already a git repo
chkd upgrade
```

This creates:
- `docs/SPEC.md` - Your feature checklist
- `docs/GUIDE.md` - This guide
- `CLAUDE.md` - Instructions for Claude
- `.claude/skills/` - Build skills

### 4. Add features to your spec

Edit `docs/SPEC.md`:

```markdown
# My Project

## Frontend

- [ ] **FE.1 Login page** - Email/password form with validation
- [ ] **FE.2 Dashboard** - Show user stats

## Backend

- [ ] **BE.1 Auth API** - Login, logout, sessions
```

### 5. Build something

Start Claude Code in your project folder:

```bash
claude
```

Then use the `/chkd` skill:

```
/chkd FE.1
```

Claude reads your spec and builds the feature.

---

## MCP Tools

When the MCP server is connected, Claude has these tools:

**Core Workflow:**
| Tool | What it does |
|------|--------------|
| `status` | See current state - **run this first!** |
| `working` | Signal starting work on an item |
| `tick` | Mark item complete |
| `suggest` | Get suggestion for what to work on next |
| `add` | Add feature with workflow sub-tasks |
| `add_child` | Add sub-task to existing item |

**Sessions & Focus:**
| Tool | What it does |
|------|--------------|
| `impromptu` | Start ad-hoc work session |
| `debug` | Start investigation session |
| `done` | End current session |
| `pivot` | Change anchor/focus explicitly |
| `checkin` | 15-minute check-in |
| `pulse` | Quick status update |
| `also` | Log off-task work without derailing |

**Bugs:**
| Tool | What it does |
|------|--------------|
| `bug` | Log a bug without derailing |
| `bugs` | List all open bugs |
| `bugfix` | Start working on a bug |
| `fix` | Signal fix ready for verification |
| `resolve` | Close bug after user verified |

**Quick Wins:**
| Tool | What it does |
|------|--------------|
| `win` | Add a quick win |
| `wins` | List quick wins |
| `won` | Mark quick win done |

**Epics:**
| Tool | What it does |
|------|--------------|
| `epic` | Create epic for large features |
| `epics` | List all epics with progress |
| `tag` | Link item to epic via tag |

---

## Dashboard UI

Access the dashboard at `http://localhost:3847` when the server is running.

### Views

Toggle between three views using the buttons in the header:

| View | Description |
|------|-------------|
| **Todo List** | Items grouped by priority (P1/P2/P3/Backlog) |
| **By Area** | Items grouped by area (SD/FE/BE/FUT) |
| **By Epic** | Items grouped by epic tag |

### Epic View

The epic view shows all epics with:
- **Description** visible under the header
- **Progress bar** showing completion (X/Y items)
- **Status badge** (planning, in-progress, review, complete)
- **Collapsible stories** section

Items tagged with an epic appear grouped together. Epic tags are highlighted in coral across all views.

Click the file path to open the epic doc in VS Code.

### Filtering

- **Search box** - Filter items by title
- **Show completed** - Toggle to show/hide completed items
- **Tag filter** - Click tags to filter by epic

**Resources** (Claude reads these for context):
- `chkd://conscience` - Session state, guidance, habits
- `chkd://spec` - Current spec with progress

---

## Multi-Worker System

Run multiple Claude instances in parallel to build faster. One "Manager" Claude coordinates while "Worker" Claudes execute tasks on separate branches.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MANAGER CLAUDE                            │
│                     (your main terminal)                         │
│                                                                  │
│   Responsibilities:                                              │
│   • Assign tasks to workers                                      │
│   • Monitor progress via chkd_workers()                          │
│   • Review completed work                                        │
│   • Merge branches when ready                                    │
│   • Resolve conflicts if any                                     │
└─────────────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   WORKER 1   │ │   WORKER 2   │ │   WORKER 3   │
    │              │ │              │ │              │
    │ Task: FE.11  │ │ Task: BE.24  │ │ Task: SD.28  │
    │ Branch:      │ │ Branch:      │ │ Branch:      │
    │ feature/fe11 │ │ feature/be24 │ │ feature/sd28 │
    │              │ │              │ │              │
    │ Worktree:    │ │ Worktree:    │ │ Worktree:    │
    │ ../proj-w1/  │ │ ../proj-w2/  │ │ ../proj-w3/  │
    └──────────────┘ └──────────────┘ └──────────────┘
```

Each worker runs in its own **git worktree** - a separate directory with its own branch, sharing the same git history.

### When to Use Workers

**Good for:**
- Independent tasks (FE while you do BE)
- Parallel features that don't overlap
- Speeding up large feature builds

**Avoid when:**
- Tasks modify the same files
- Deep dependencies between tasks
- You need tight coordination

### First-Time Setup

#### Step 1: Pick Independent Tasks

Look at your spec and find 2-3 tasks that don't overlap:

```
Good pairing:
  • FE.11 (App shell)     - touches src/routes/
  • BE.24 (Chat API)      - touches src/lib/server/

Bad pairing:
  • FE.11 (App shell)     - touches src/routes/+page.svelte
  • FE.12 (Chat UI)       - ALSO touches src/routes/+page.svelte
```

#### Step 2: Spawn Your First Worker

In your main Claude session (the Manager), run:

```
chkd_spawn_worker(
  taskId: "FE.11",
  taskTitle: "App shell & navigation"
)
```

You'll see output like:

```
✅ Worker spawned: worker-alex-fe11

📂 Worktree: /Users/alex/chkd-worker-alex-fe11
🌿 Branch: feature/fe11-app-shell-navigation

To start the worker, run in a NEW terminal:
────────────────────────────────────────
cd /Users/alex/chkd-worker-alex-fe11 && claude
────────────────────────────────────────
```

#### Step 3: Start the Worker

Open a **new terminal window** and run the command:

```bash
cd /Users/alex/chkd-worker-alex-fe11 && claude
```

The worker Claude will automatically:
1. Detect it's a worker (from `.chkd-worker.json`)
2. Know its assigned task
3. Start working with `chkd_working("FE.11")`

#### Step 4: Monitor from Manager

Back in your Manager terminal, check on workers:

```
chkd_workers()
```

Output:
```
🔨 Active Workers (1)
─────────────────────
worker-alex-fe11
  Task: FE.11 App shell & navigation
  Status: WORKING
  Progress: 35%
  Last heartbeat: 2 min ago
```

### Worker Lifecycle

```
┌──────────┐    spawn     ┌──────────┐    start    ┌──────────┐
│ PENDING  │ ──────────▶  │ WORKING  │ ──────────▶ │ MERGING  │
└──────────┘              └──────────┘              └──────────┘
     │                         │                         │
     │                         │                         │
     ▼                         ▼                         ▼
  Created,                  Actively                  Task done,
  waiting                   building                  ready to
  to start                  the task                  merge
                                                         │
                                                         ▼
                                                   ┌──────────┐
                                                   │   DONE   │
                                                   └──────────┘
                                                         │
                                                         ▼
                                                    Merged to
                                                    main, worker
                                                    cleaned up
```

### Manager Commands

| Command | What it does |
|---------|--------------|
| `chkd_spawn_worker(taskId, taskTitle)` | Create new worker |
| `chkd_workers()` | List all active workers |
| `chkd_merge_worker(workerId)` | Merge worker's branch |
| `chkd_pause_worker(workerId)` | Pause a worker |
| `chkd_resume_worker(workerId)` | Resume paused worker |
| `chkd_stop_worker(workerId)` | Cancel and cleanup |
| `chkd_dead_workers()` | Find stuck workers |

### Worker Commands

Workers use these automatically, but for reference:

| Command | What it does |
|---------|--------------|
| `chkd_worker_heartbeat(id, msg, %)` | Report progress |
| `chkd_worker_complete(id, summary)` | Signal task done |
| `chkd_worker_status(id)` | Check for instructions |

### Merging Completed Work

When a worker finishes:

```
chkd_merge_worker(workerId: "worker-alex-fe11")
```

**If no conflicts:**
```
✅ Merged successfully!
Branch feature/fe11-app-shell-navigation merged to main.
Worker cleaned up.
```

**If conflicts exist:**
```
⚠️ Conflicts detected in:
  - src/routes/+page.svelte
  - src/lib/api.ts

Options:
  1. Keep worker changes
  2. Keep main changes
  3. Manual resolution needed
```

### Example Session

```
YOU (Manager Claude):
────────────────────────────────────────
1. chkd_status()           # See what's available
2. Pick FE.11 and BE.24    # Independent tasks

3. chkd_spawn_worker(taskId: "FE.11", taskTitle: "App shell")
   → Opens worker in new terminal

4. chkd_spawn_worker(taskId: "BE.24", taskTitle: "Chat API")
   → Opens worker in another terminal

5. Work on something else, or coordinate

6. chkd_workers()          # Check progress
   → Worker 1: 80% done
   → Worker 2: 45% done

7. chkd_merge_worker("worker-alex-fe11")  # Merge first one
   → ✅ Merged!

8. Continue monitoring Worker 2...
────────────────────────────────────────

WORKER 1 (separate terminal):
────────────────────────────────────────
# Automatically starts with task context
1. Builds FE.11 following the spec
2. Sends heartbeats every few minutes
3. When done: chkd_worker_complete()
────────────────────────────────────────
```

### Dashboard View

The chkd dashboard shows workers in the repo card:

```
┌─────────────────────────────────────────────────────┐
│  📁 my-project                           67% ████░░ │
│                                                     │
│  Current: Building user auth                        │
│                                                     │
│  👥 Workers:                                        │
│     🟢 worker-alex-fe11  FE.11  Working  80%       │
│     🟡 worker-alex-be24  BE.24  Merging            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Troubleshooting

**Worker not responding:**
```
chkd_dead_workers()           # Find stuck workers
chkd_stop_worker(id, force: true)  # Force cleanup
```

**Merge conflicts:**
- Option 1: Resolve manually in the worktree directory
- Option 2: Stop worker, cherry-pick specific commits
- Option 3: Abort and reassign task

**Worktree issues:**
```bash
# List all worktrees
git worktree list

# Remove orphaned worktree
git worktree remove ../proj-worker-old --force
```

### Best Practices

1. **Keep tasks small** - Easier to merge, less conflict risk
2. **Different areas** - FE + BE is better than FE + FE
3. **Merge often** - Don't let branches diverge too long
4. **Monitor progress** - Check `chkd_workers()` regularly
5. **One manager** - Don't run multiple manager sessions

---

## Skills (in Claude Code)

| Skill | Purpose |
|-------|---------|
| `/chkd FE.1` | Build task FE.1 from the spec |
| `/story` | Plan features, refine specs |
| `/bugfix` | Fix bugs with minimal changes |
| `/commit` | Safe commit workflow |

---

## Daily Workflow

```
1. Start chkd server     →  cd ~/chkd && npm run dev
2. Open Claude Code      →  claude
3. Check status          →  Claude runs status
4. Build a task          →  /chkd FE.1
5. Review and commit     →  /commit
6. Repeat
```

---

## Spec Format

```markdown
## Area Name

- [ ] **CODE.1 Feature title** - Description
  - [ ] Sub-task 1
  - [ ] Sub-task 2
```

**Area codes:** FE (Frontend), BE (Backend), SD (Site Design), FUT (Future)

**Markers:**
- `[ ]` - Not started
- `[~]` - In progress
- `[x]` - Complete
- `[!]` - Blocked

---

## Staying Focused

When working on a task:

1. **Notice a bug?** → `bug("description")` then continue
2. **Want to refactor?** → Log it, don't do it
3. **Something seems off?** → Log it, stay on track

The bugs/quick wins lists exist so nothing gets lost. Fix them later.

---

## Files chkd Creates

| File | Purpose |
|------|---------|
| `docs/SPEC.md` | Feature checklist (optional, can be imported to DB) |
| `docs/GUIDE.md` | This guide |
| `docs/PHILOSOPHY.md` | Full chkd philosophy explanation |
| `docs/instructions/` | Mode-specific guidance (build, bugfix, debug, etc.) |
| `docs/QUICKWINS.md` | Small improvements to do later |
| `docs/attachments/` | File attachments for bugs/items |
| `CLAUDE.md` | Core behaviors for Claude (short, focused) |
| `.claude/skills/` | Build skills |

---

## Troubleshooting

**"Cannot connect to chkd"**
```bash
cd ~/chkd && npm run dev
```

**MCP tools not showing up**
- Check Claude Code MCP settings
- Restart Claude Code after config changes
- Verify the path in config is correct

**"Task not found"**
- Check `docs/SPEC.md` has the task with correct format
- Format: `- [ ] **FE.1 Title** - Description`

---

## Need Help?

- UI: `http://localhost:3847`
