# Multi-Worker System - Detailed Specification

**Version:** 1.0
**Status:** Draft - Awaiting Review
**Created:** 2026-01-23

---

## Table of Contents

1. [Overview](#overview)
2. [User Experience](#user-experience)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Git Operations](#git-operations)
7. [MCP Tools](#mcp-tools)
8. [UI Components](#ui-components)
9. [Manager AI Logic](#manager-ai-logic)
10. [Error Handling](#error-handling)
11. [Security & Safety](#security--safety)
12. [Implementation Order](#implementation-order)

---

## 1. Overview

### What Is This?

A system that allows multiple Claude instances to work in parallel on the same codebase, each in their own git worktree, coordinated by a "Master Claude" that handles task assignment, monitoring, and merging.

### Key Principles

1. **Simple for the user** - Click "Spawn", watch work happen, get merged code
2. **Git complexity hidden** - User never touches branches, worktrees, or merge commands
3. **Safety by default** - Master Claude checks everything before merging
4. **Visibility** - Always clear what's happening via UI and manager signals

### Terminology

| Term | Definition |
|------|------------|
| **Manager Claude** | The coordinating Claude instance - Tech Lead role (runs in main worktree) |
| **Worker Claude** | A Claude instance assigned to a specific task (runs in separate worktree) |
| **Worktree** | Git worktree - separate directory with its own branch checkout |
| **Manager Signals** | Messages from Manager Claude to the user about status/decisions |
| **Split Brain View** | Side-by-side UI showing both workers |

### Manager Claude Responsibilities

The Manager is not just a coordinator - it's a **Tech Lead**:

| Role | What Manager Does |
|------|-------------------|
| **Story Writer** | Refines user requests into detailed specs with acceptance criteria |
| **Researcher** | Explores codebase, understands patterns before assigning work |
| **Task Assigner** | Breaks down work, assigns to workers based on complexity |
| **Code Reviewer** | Reviews worker output before approving merge |
| **Documenter** | Updates docs, READMEs, and CHANGELOG after work completes |
| **Coordinator** | Monitors progress, handles conflicts, communicates with user |
| **Quality Gate** | Ensures work meets standards before merging to main |

**Workflow with Manager as Tech Lead:**

```
User Request: "Add user authentication"
     │
     ▼
┌─────────────────────────────────────────┐
│  MANAGER CLAUDE (Tech Lead)             │
│                                         │
│  1. RESEARCH                            │
│     • Explore codebase structure        │
│     • Find existing auth patterns       │
│     • Identify dependencies             │
│                                         │
│  2. WRITE STORY                         │
│     • Create detailed spec              │
│     • Define acceptance criteria        │
│     • Break into sub-tasks              │
│                                         │
│  3. ASSIGN WORK                         │
│     • Spawn Worker 1: Backend API       │
│     • Spawn Worker 2: Frontend UI       │
│                                         │
│  4. MONITOR & COORDINATE                │
│     • Track progress                    │
│     • Handle blockers                   │
│     • Answer worker questions           │
│                                         │
│  5. CODE REVIEW                         │
│     • Review each worker's output       │
│     • Check quality, tests, patterns    │
│     • Request changes if needed         │
│                                         │
│  6. MERGE & DOCUMENT                    │
│     • Merge approved work               │
│     • Update README with new feature    │
│     • Add to CHANGELOG                  │
│     • Update API docs if needed         │
│                                         │
│  7. REPORT TO USER                      │
│     • Summarize what was done           │
│     • Highlight any decisions made      │
│     • Note any follow-up items          │
│                                         │
└─────────────────────────────────────────┘
     │                    │
     ▼                    ▼
┌──────────┐        ┌──────────┐
│ Worker 1 │        │ Worker 2 │
│ Backend  │        │ Frontend │
│ (coding) │        │ (coding) │
└──────────┘        └──────────┘
```

**Manager Reviews Before Merge:**

Before auto-merging, Manager Claude:
1. Pulls worker's branch
2. Reviews changes (diff)
3. Checks for:
   - Code quality issues
   - Missing tests
   - Incomplete implementation
   - Style/pattern violations
4. If issues: Sends back to worker with feedback
5. If good: Approves merge

### External Collaboration: Idea Submissions

Allow non-developers (stakeholders, users, PMs) to submit feature ideas:

```
External User                    chkd System                    Manager Claude
     │                               │                               │
     │  Submit idea via form         │                               │
     │  "Add dark mode toggle"       │                               │
     │ ─────────────────────────────►│                               │
     │                               │                               │
     │                               │  Store in ideas_queue         │
     │                               │  Send confirmation email      │
     │                               │                               │
     │  ◄───────────────────────────│                               │
     │  "Thanks! ID: idea-123"       │                               │
     │                               │                               │
     │                               │  Manager reviews queue        │
     │                               │ ─────────────────────────────►│
     │                               │                               │
     │                               │  Refines into proper story    │
     │                               │ ◄─────────────────────────────│
     │                               │                               │
     │                               │  Approve → Add to SPEC.md     │
     │                               │  Reject → Send feedback       │
     │                               │                               │
     │  Email: "Your idea accepted!" │                               │
     │  ◄───────────────────────────│                               │
```

**Ideas Queue Table:**
```sql
CREATE TABLE ideas_queue (
    id TEXT PRIMARY KEY,           -- 'idea-{timestamp}'
    repo_id INTEGER,               -- Which project (optional)

    -- Submission
    title TEXT NOT NULL,
    description TEXT,
    submitted_by TEXT,             -- Email or name
    submitted_at INTEGER NOT NULL,

    -- Review
    status TEXT DEFAULT 'pending', -- pending|reviewing|approved|rejected
    reviewed_at INTEGER,
    reviewer_notes TEXT,

    -- If approved
    spec_item_id TEXT,             -- Links to created spec item

    -- If rejected
    rejection_reason TEXT
);
```

**Benefits:**
- Stakeholders can contribute without git/code access
- Ideas are triaged by Manager, not dumped into spec
- Audit trail of what was suggested and by whom
- Feedback loop to submitters

### Constraints

- **Max 2 workers** initially (can increase later)
- **Manual window opening** - User opens new Claude Code window when prompted
- **Polling-based** - Workers report status every 30 seconds via API
- **SQLite database** - Local cache, git is source of truth

### Future-Proofing: Multi-User Ready

This design is built to evolve to multi-user/multi-location:

| Design Choice | Why It Helps Multi-User |
|---------------|------------------------|
| Branch = claim | Anyone can `git fetch` to see what's taken |
| Username in branch | Know WHO has the task, not just that it's taken |
| Git as source of truth | No central server needed |
| DB as cache | Fast local UI, git is authoritative |
| Status files in repo | `git pull` = see everyone's status |

### Future-Proofing: SaaS Ready

chkd could become a hosted SaaS product. Design choices that enable this:

| Design Choice | Why It Helps SaaS |
|---------------|-------------------|
| API-first architecture | Easy to add auth, multi-tenancy |
| SQLite → PostgreSQL path | Schema designed for easy migration |
| Git as coordination | Works with any git host (GitHub, GitLab, etc.) |
| Stateless workers | Can run on cloud instances |
| External idea submission | Already has public-facing entry point |

**SaaS Architecture (Future):**

```
┌─────────────────────────────────────────────────────────────┐
│                    chkd Cloud (SaaS)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Web UI    │  │   API       │  │  Workers    │         │
│  │  (React/    │  │  (Auth,     │  │  (Managed   │         │
│  │   Svelte)   │  │   Teams)    │  │   Claude)   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          │                                  │
│                   ┌──────▼──────┐                          │
│                   │ PostgreSQL  │                          │
│                   │ (Multi-     │                          │
│                   │  tenant)    │                          │
│                   └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────┐        ┌─────────────┐
│  Customer   │        │  Customer   │
│  Git Repo   │        │  Git Repo   │
│  (GitHub)   │        │  (GitLab)   │
└─────────────┘        └─────────────┘
```

**SaaS Features (Future):**
- Team workspaces with roles (admin, dev, viewer)
- Managed Claude workers (no local setup)
- GitHub/GitLab app integration
- Usage-based billing (per worker-hour)
- Idea portal for stakeholders
- Analytics dashboard (velocity, time per task)

### File Sharing Considerations

With MCP, Claude can access local files directly. But file sharing still matters for:

| Scenario | Solution |
|----------|----------|
| External idea submissions | Attach screenshots, docs to ideas |
| Worker ↔ Worker | Git handles code; large files use Git LFS |
| Worker ↔ Manager | Same repo, shared .chkd/ folder |
| External stakeholders | Upload to ideas queue, store in .chkd/uploads/ |
| SaaS mode | Cloud storage (S3) for attachments |

**For V1:** Keep it simple - files go in repo or .chkd/ folder. Git handles sync.

**For SaaS:** Add cloud storage integration later.

---

## 2. User Experience

### User Journey: Spawn Two Workers

```
1. USER opens chkd dashboard
   - Sees repo card with "👷 No workers active"
   - Sees task list with [⚡ Spawn] buttons

2. USER clicks [⚡ Spawn] on "SD.3 User Authentication"
   - Modal appears: "Spawn Worker for SD.3?"
   - USER clicks [🚀 Spawn Worker]

3. SYSTEM creates worktree + records worker
   - Master Claude runs: git worktree add ../myproject-worker-1 -b feature/sd3-user-auth
   - Database: INSERT INTO workers (...)
   - UI updates: Shows Worker 1 card in "Waiting" state

4. UI shows instructions:
   "Open new Claude Code window:
    cd ~/myproject-worker-1
    claude"
   [Copy Command]

5. USER opens new terminal, runs commands
   - New Claude Code session starts in worktree
   - Worker Claude calls chkd_worker_claim() on startup
   - Worker status changes: "Waiting" → "Working"

6. USER clicks [⚡ Spawn] on "SD.4 Dashboard"
   - Same flow, creates Worker 2
   - Now at max capacity (2/2)

7. USER watches Split Brain View:
   - Worker 1: SD.3 Auth (75%) "Adding JWT..."
   - Worker 2: SD.4 Dashboard (40%) "Grid layout..."
   - Manager: "Both workers progressing well"

8. WORKER 1 completes task
   - Calls chkd_worker_complete()
   - Master Claude checks for conflicts
   - No conflicts → Auto-merge
   - Manager: "✅ SD.3 merged! Starting SD.5..."
   - Worker 1 gets next task from queue

9. WORKER 2 completes, but has conflict
   - Master Claude detects conflict in App.svelte
   - Manager: "⚠️ Conflict in App.svelte. Need your help."
   - USER clicks [View Conflict]
   - USER chooses [Keep Both]
   - Master resolves, merges
   - Manager: "✅ Resolved and merged!"

10. All tasks complete
    - Workers idle or stopped
    - Manager: "📊 Session complete: 5 tasks, 45 min, 1 conflict resolved"
```

### User Actions Available

| Action | Where | What Happens |
|--------|-------|--------------|
| Spawn Worker | Task list or repo card | Creates worktree, shows instructions |
| Pause Worker | Worker card | Worker stops, preserves state |
| Resume Worker | Worker card | Worker continues |
| Stop Worker | Worker card | Worker aborted, worktree preserved |
| View Code | Worker card | Opens worktree in file browser |
| View Conflict | Manager signal | Shows conflict resolution UI |
| Keep Mine/Theirs/Both | Conflict modal | Resolves conflict |
| Dismiss | Manager signal | Hides signal |

---

## 3. Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER                                    │
│                          │                                      │
│                    [chkd Web UI]                                │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SvelteKit Server                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Worker API   │  │  Git Utils   │  │  Manager     │          │
│  │ /api/workers │  │  worktree.ts │  │  Logic       │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────┬────┴─────────────────┘                   │
│                      │                                          │
│               ┌──────▼──────┐                                   │
│               │   SQLite    │                                   │
│               │   Database  │                                   │
│               │  (workers,  │                                   │
│               │   sessions) │                                   │
│               └─────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ Main Worktree │  │   Worktree 1  │  │   Worktree 2  │
│ ~/myproject/  │  │ ~/myproject-  │  │ ~/myproject-  │
│               │  │   worker-1/   │  │   worker-2/   │
│ Master Claude │  │ Worker Claude │  │ Worker Claude │
│ (coordinator) │  │ (task: SD.3)  │  │ (task: SD.4)  │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │                  │
        │     MCP Tools    │     MCP Tools    │
        │  (chkd_spawn_    │  (chkd_worker_   │
        │   worker, etc)   │   heartbeat)     │
        └──────────────────┴──────────────────┘
                           │
                           ▼
                    [Shared .git]
                    (all worktrees
                     share same repo)
```

### Data Flow: Worker Heartbeat

```
Worker Claude                    API                      Database
     │                            │                           │
     │  chkd_worker_heartbeat()   │                           │
     │ ────────────────────────►  │                           │
     │  { message: "Adding JWT",  │                           │
     │    progress: 75 }          │                           │
     │                            │                           │
     │                            │  UPDATE workers SET       │
     │                            │  heartbeat_at = NOW(),    │
     │                            │  message = "Adding JWT",  │
     │                            │  progress = 75            │
     │                            │  WHERE id = ?             │
     │                            │ ─────────────────────────►│
     │                            │                           │
     │                            │◄─────────────────────────│
     │                            │                           │
     │  { status: "working",      │                           │
     │    shouldPause: false }    │                           │
     │ ◄────────────────────────  │                           │
     │                            │                           │
```

### Data Flow: Merge

```
Worker Claude         API              Git Utils           Database
     │                 │                   │                   │
     │ complete()      │                   │                   │
     │ ───────────────►│                   │                   │
     │                 │                   │                   │
     │                 │  checkConflicts() │                   │
     │                 │ ─────────────────►│                   │
     │                 │                   │                   │
     │                 │                   │ git merge --no-   │
     │                 │                   │ commit --no-ff    │
     │                 │                   │ feature/sd3       │
     │                 │                   │                   │
     │                 │ { conflicts: [] } │                   │
     │                 │ ◄─────────────────│                   │
     │                 │                   │                   │
     │                 │  (no conflicts)   │                   │
     │                 │  mergeWorktree()  │                   │
     │                 │ ─────────────────►│                   │
     │                 │                   │                   │
     │                 │                   │ git merge         │
     │                 │                   │ git worktree      │
     │                 │                   │ remove            │
     │                 │                   │                   │
     │                 │ { success: true } │                   │
     │                 │ ◄─────────────────│                   │
     │                 │                   │                   │
     │                 │  UPDATE workers   │                   │
     │                 │  SET status='merged'                  │
     │                 │ ──────────────────────────────────────►
     │                 │                   │                   │
     │ { merged: true }│                   │                   │
     │ ◄───────────────│                   │                   │
```

---

## 4. Database Schema

### New Tables

#### `workers` - Active worker instances

```sql
CREATE TABLE workers (
    id TEXT PRIMARY KEY,                    -- 'worker-{username}-{timestamp}-{random4}'
    repo_id INTEGER NOT NULL,               -- FK to repos table
    username TEXT NOT NULL,                 -- 'alex' (for multi-user ready)

    -- Assignment
    task_id TEXT,                           -- 'SD.3' (spec item ID)
    task_title TEXT,                        -- 'User Authentication'

    -- Status
    status TEXT NOT NULL DEFAULT 'pending', -- pending|waiting|working|paused|merging|merged|error
    message TEXT,                           -- Last status message from worker
    progress INTEGER DEFAULT 0,             -- 0-100 percentage

    -- Git
    worktree_path TEXT,                     -- '../myproject-alex-1'
    branch_name TEXT,                       -- 'feature/alex/sd3-user-auth'

    -- Timing
    created_at INTEGER NOT NULL,            -- Unix timestamp
    started_at INTEGER,                     -- When worker actually started
    completed_at INTEGER,                   -- When task completed
    heartbeat_at INTEGER,                   -- Last heartbeat (detect dead workers)

    -- Queue
    next_task_id TEXT,                      -- Pre-assigned next task
    next_task_title TEXT,

    FOREIGN KEY (repo_id) REFERENCES repos(id)
);

-- Index for quick lookups
CREATE INDEX idx_workers_repo_status ON workers(repo_id, status);
CREATE INDEX idx_workers_heartbeat ON workers(heartbeat_at);
CREATE INDEX idx_workers_username ON workers(username);
```

#### `worker_history` - Completed worker sessions (audit trail)

```sql
CREATE TABLE worker_history (
    id TEXT PRIMARY KEY,
    repo_id INTEGER NOT NULL,
    worker_id TEXT NOT NULL,                -- Original worker ID

    -- What was done
    task_id TEXT,
    task_title TEXT,
    branch_name TEXT,

    -- Outcome
    outcome TEXT NOT NULL,                  -- merged|aborted|error
    merge_conflicts INTEGER DEFAULT 0,      -- Number of conflicts
    files_changed INTEGER DEFAULT 0,
    insertions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,

    -- Timing
    started_at INTEGER,
    completed_at INTEGER,
    duration_ms INTEGER,                    -- Total time

    FOREIGN KEY (repo_id) REFERENCES repos(id)
);
```

#### `manager_signals` - Messages from manager to user

```sql
CREATE TABLE manager_signals (
    id TEXT PRIMARY KEY,                    -- 'signal-{timestamp}-{random4}'
    repo_id INTEGER NOT NULL,

    -- Content
    type TEXT NOT NULL,                     -- status|decision|help|suggestion|warning
    message TEXT NOT NULL,
    details TEXT,                           -- JSON: additional context

    -- State
    dismissed INTEGER DEFAULT 0,            -- User dismissed this signal
    action_required INTEGER DEFAULT 0,      -- Needs user input
    action_options TEXT,                    -- JSON: available actions

    -- Timing
    created_at INTEGER NOT NULL,
    dismissed_at INTEGER,

    FOREIGN KEY (repo_id) REFERENCES repos(id)
);

CREATE INDEX idx_signals_repo_active ON manager_signals(repo_id, dismissed);
```

### Git-Based Status Files (Multi-User Ready)

Optional: Store worker status in repo for distributed visibility.

```
.chkd/
├── workers/
│   ├── alex-sd3.json        # Alex working on SD.3
│   └── bob-fe1.json         # Bob working on FE.1
└── config.json              # Shared team config
```

**Worker status file format:**
```json
{
    "username": "alex",
    "taskId": "SD.3",
    "taskTitle": "User Authentication",
    "status": "working",
    "progress": 75,
    "message": "Adding JWT refresh logic...",
    "startedAt": 1706012345000,
    "updatedAt": 1706013456000,
    "branch": "feature/alex/sd3-user-auth"
}
```

**How it works:**
1. Worker heartbeat updates local `.chkd/workers/{user}-{task}.json`
2. Periodically commit + push (every 5min or on milestone)
3. Other users `git pull` to see team status
4. On complete: delete status file, merge branch

**Benefits:**
- No sync service needed
- Works offline (syncs when online)
- Full history in git
- Any git client shows status

**Note:** This is OPTIONAL for V1. Local DB is sufficient for single-user. Add this when multi-user is needed.

---

### Schema Changes to Existing Tables

#### `sessions` - Add worker reference

```sql
ALTER TABLE sessions ADD COLUMN worker_id TEXT REFERENCES workers(id);
ALTER TABLE sessions ADD COLUMN is_master INTEGER DEFAULT 0;
```

### Status State Machine

```
Worker Status Transitions:

  [pending] ──spawn──► [waiting] ──claim──► [working]
                           │                    │
                           │                    ├──pause──► [paused] ──resume──► [working]
                           │                    │
                           │                    └──complete──► [merging] ──success──► [merged]
                           │                                       │
                           └──────────abort────────────────────────┴──error──► [error]
```

---

## 5. API Endpoints

### Worker Management

#### `POST /api/workers/spawn`

Create a new worker, set up worktree, assign task.

**Request:**
```typescript
{
    repoPath: string;          // '/Users/alex/myproject'
    taskId: string;            // 'SD.3'
    taskTitle: string;         // 'User Authentication'
    username?: string;         // 'alex' (default: from git config or OS)
    nextTaskId?: string;       // 'SD.5' (optional pre-assignment)
    nextTaskTitle?: string;
}
```

**Response:**
```typescript
{
    success: boolean;
    data?: {
        workerId: string;           // 'worker-alex-1706012345-a1b2'
        worktreePath: string;       // '../myproject-alex-1'
        branchName: string;         // 'feature/alex/sd3-user-auth'
        command: string;            // 'cd ../myproject-alex-1 && claude'
    };
    error?: string;
    hint?: string;
}
```

**Logic:**
1. Get username (param, git config, or OS username)
2. Check max workers not exceeded (2)
3. **Check remote for existing branch** (multi-user ready):
   - `git fetch origin`
   - `git branch -r | grep feature/*/sd3-*`
   - If exists → task already claimed by someone
4. Check local DB task not already assigned
5. Generate worker ID: `worker-{username}-{timestamp}-{random4}`
6. Generate branch name: `feature/{username}/{taskId}-{slugify(taskTitle)}`
7. Generate worktree path: `../{repoName}-{username}-{N}`
8. Create git worktree + branch
9. **Push branch to remote** (claim is visible to others)
10. Insert worker record (status: 'waiting')
11. Return connection instructions

**Errors:**
- `MAX_WORKERS_REACHED` - Already at 2 workers
- `TASK_ALREADY_ASSIGNED` - Another worker has this task (local)
- `TASK_CLAIMED_REMOTE` - Branch exists on remote (someone else has it)
- `WORKTREE_EXISTS` - Worktree path already exists
- `GIT_ERROR` - Git command failed

---

#### `GET /api/workers`

List all workers for a repo.

**Request:**
```
GET /api/workers?repoPath=/Users/alex/myproject
```

**Response:**
```typescript
{
    success: boolean;
    data?: {
        workers: Worker[];
        maxWorkers: number;        // 2
        activeCount: number;       // Current active workers
    };
}

interface Worker {
    id: string;
    taskId: string;
    taskTitle: string;
    status: 'pending' | 'waiting' | 'working' | 'paused' | 'merging' | 'merged' | 'error';
    message: string;
    progress: number;              // 0-100
    worktreePath: string;
    branchName: string;
    startedAt: number;
    elapsedMs: number;
    heartbeatAgo: number;          // Seconds since last heartbeat
    nextTaskId?: string;
    nextTaskTitle?: string;
}
```

---

#### `PATCH /api/workers/:workerId`

Update worker status (used by workers for heartbeat).

**Request:**
```typescript
{
    status?: 'working' | 'paused' | 'error';
    message?: string;              // Status message
    progress?: number;             // 0-100
    heartbeat?: boolean;           // Just a ping
}
```

**Response:**
```typescript
{
    success: boolean;
    data?: {
        shouldPause: boolean;      // Master requested pause
        shouldAbort: boolean;      // Master requested abort
        nextTask?: {               // If current task done, here's next
            taskId: string;
            taskTitle: string;
        };
    };
}
```

---

#### `POST /api/workers/:workerId/complete`

Worker signals task completion, triggers merge check.

**Request:**
```typescript
{
    message?: string;              // Final status message
}
```

**Response:**
```typescript
{
    success: boolean;
    data?: {
        mergeStatus: 'clean' | 'conflicts' | 'pending';
        conflicts?: Conflict[];
        nextTask?: {
            taskId: string;
            taskTitle: string;
        };
    };
}

interface Conflict {
    file: string;
    type: 'content' | 'deleted' | 'renamed';
    ours: string;                  // Our version snippet
    theirs: string;                // Their version snippet
    lines: number;                 // Approx conflict size
}
```

**Logic:**
1. Mark worker status: 'merging'
2. Run conflict check (git merge --no-commit)
3. If clean:
   - Complete merge
   - Mark worker status: 'merged'
   - Clean up worktree
   - Assign next task if available
   - Create manager signal: "✅ Merged {task}!"
4. If conflicts:
   - Abort merge attempt
   - Create manager signal: "⚠️ Conflict in {files}"
   - Return conflict details

---

#### `POST /api/workers/:workerId/resolve`

User resolved conflict, complete the merge.

**Request:**
```typescript
{
    resolution: 'ours' | 'theirs' | 'both' | 'manual';
    manualResolutions?: {
        file: string;
        content: string;
    }[];
}
```

**Response:**
```typescript
{
    success: boolean;
    data?: {
        merged: boolean;
        filesChanged: number;
        insertions: number;
        deletions: number;
    };
}
```

---

#### `DELETE /api/workers/:workerId`

Stop worker, optionally cleanup worktree.

**Request:**
```typescript
{
    cleanup?: boolean;             // Remove worktree (default: false)
    reason?: string;               // Why stopped
}
```

**Response:**
```typescript
{
    success: boolean;
    data?: {
        preservedBranch?: string;  // If not cleaned up
        preservedPath?: string;
    };
}
```

---

#### `POST /api/workers/:workerId/pause`

Pause a worker.

**Response:**
```typescript
{
    success: boolean;
}
```

---

#### `POST /api/workers/:workerId/resume`

Resume a paused worker.

**Response:**
```typescript
{
    success: boolean;
}
```

---

### Manager Signals

#### `GET /api/manager/signals`

Get active manager signals.

**Request:**
```
GET /api/manager/signals?repoPath=/Users/alex/myproject
```

**Response:**
```typescript
{
    success: boolean;
    data?: {
        signals: ManagerSignal[];
    };
}

interface ManagerSignal {
    id: string;
    type: 'status' | 'decision' | 'help' | 'suggestion' | 'warning';
    message: string;
    details?: any;
    actionRequired: boolean;
    actionOptions?: string[];      // e.g., ['Keep Mine', 'Keep Theirs', 'Keep Both']
    createdAt: number;
}
```

---

#### `POST /api/manager/signals/:signalId/dismiss`

Dismiss a signal.

**Response:**
```typescript
{
    success: boolean;
}
```

---

#### `POST /api/manager/signals/:signalId/action`

Take action on a signal.

**Request:**
```typescript
{
    action: string;                // One of the actionOptions
}
```

**Response:**
```typescript
{
    success: boolean;
    data?: any;                    // Depends on action
}
```

---

## 6. Git Operations

### Module: `src/lib/server/git/worktree.ts`

```typescript
// Types
interface WorktreeInfo {
    path: string;              // Absolute path to worktree
    branch: string;            // Branch name
    commit: string;            // Current HEAD commit
}

interface MergeResult {
    success: boolean;
    conflicts?: ConflictInfo[];
    filesChanged?: number;
    insertions?: number;
    deletions?: number;
}

interface ConflictInfo {
    file: string;
    type: 'content' | 'deleted' | 'renamed';
    oursContent?: string;      // First 10 lines
    theirsContent?: string;    // First 10 lines
    conflictLines: number;
}

// Functions

/**
 * Create a new worktree with feature branch
 */
async function createWorktree(
    repoPath: string,
    worktreePath: string,
    branchName: string
): Promise<WorktreeInfo>

/**
 * Remove a worktree and optionally its branch
 */
async function removeWorktree(
    repoPath: string,
    worktreePath: string,
    deleteBranch?: boolean
): Promise<void>

/**
 * List all worktrees for a repo
 */
async function listWorktrees(
    repoPath: string
): Promise<WorktreeInfo[]>

/**
 * Check for merge conflicts WITHOUT actually merging
 * Uses: git merge --no-commit --no-ff, then git merge --abort
 */
async function checkConflicts(
    repoPath: string,
    branchName: string,
    targetBranch?: string       // default: 'main'
): Promise<ConflictInfo[]>

/**
 * Merge a branch into target (usually main)
 * Should only be called after checkConflicts returns empty
 */
async function mergeBranch(
    repoPath: string,
    branchName: string,
    targetBranch?: string,
    commitMessage?: string
): Promise<MergeResult>

/**
 * Resolve conflicts with a strategy
 */
async function resolveConflicts(
    repoPath: string,
    strategy: 'ours' | 'theirs',
    files?: string[]            // Specific files, or all
): Promise<void>

/**
 * Get diff stats for a branch vs target
 */
async function getBranchStats(
    repoPath: string,
    branchName: string,
    targetBranch?: string
): Promise<{
    filesChanged: number;
    insertions: number;
    deletions: number;
    files: string[];
}>
```

### Git Commands Used

```bash
# Create worktree with new branch
git worktree add <path> -b <branch-name>

# Create worktree from existing branch
git worktree add <path> <branch-name>

# List worktrees
git worktree list --porcelain

# Remove worktree
git worktree remove <path>

# Check for conflicts (dry-run merge)
git merge --no-commit --no-ff <branch>
git merge --abort

# Actual merge
git merge <branch> -m "Merge <branch>: <task-title>"

# Resolve with strategy
git checkout --ours <file>
git checkout --theirs <file>

# Get diff stats
git diff --stat <target>..<branch>

# Delete branch
git branch -d <branch>
```

### Branch Naming Convention

```
feature/{username}/{taskId}-{slugified-title}

Examples:
- feature/alex/sd3-user-authentication
- feature/alex/sd4-dashboard-layout
- feature/bob/fe1-login-form
```

**Why username?**
- Multi-user ready: Know WHO has the task
- Avoids conflicts: Two users can work on related tasks
- Git fetch shows team activity: `git branch -r | grep feature/`

### Spec File Markers (Multi-User Ready)

The spec file can show who's working on what:

```markdown
## Site Design

- [x] **SD.1 Database Schema** - Complete
- [x] **SD.2 API Design** - Complete
- [~:alex] **SD.3 User Authentication** - @alex working
- [~:bob] **SD.4 Dashboard Layout** - @bob working
- [ ] **SD.5 Settings Page** - Available
```

**Marker format:**
- `[ ]` - Not started (available)
- `[~]` - In progress (local single-user)
- `[~:username]` - In progress by specific user (multi-user)
- `[x]` - Complete

**Benefits:**
- Spec file IS the coordination
- Visible in any git client, GitHub, etc.
- `git pull` shows who's doing what
- No external service needed

### Worktree Path Convention

```
../{repo-name}-{username}-{N}

Examples:
- ../myproject-alex-1
- ../myproject-alex-2
- ../myproject-bob-1
```

**Why username?**
- Clear ownership of local worktrees
- Multiple users on same machine won't conflict
- Easy to identify in file browser

---

## 7. MCP Tools

### Master Claude Tools

#### `chkd_spawn_worker`

```typescript
server.tool(
    "chkd_spawn_worker",
    "Spawn a worker Claude to handle a task. Creates worktree, assigns task, shows connection instructions.",
    {
        taskId: z.string().describe("Task ID from spec (e.g., 'SD.3')"),
        taskTitle: z.string().describe("Task title"),
        nextTaskId: z.string().optional().describe("Pre-assign next task"),
        nextTaskTitle: z.string().optional()
    },
    async ({ taskId, taskTitle, nextTaskId, nextTaskTitle }) => {
        // Call POST /api/workers/spawn
        // Return instructions for user
    }
);
```

**Output:**
```
👷 Worker spawned for SD.3: User Authentication

Worktree: ../myproject-worker-1
Branch: feature/sd3-user-authentication

📋 To connect the worker, open a new terminal and run:

   cd ../myproject-worker-1 && claude

The worker will automatically claim this task when it starts.

💡 You can monitor progress in the chkd UI or with chkd_workers()
```

---

#### `chkd_workers`

```typescript
server.tool(
    "chkd_workers",
    "List all active workers and their status.",
    {},
    async () => {
        // Call GET /api/workers
        // Format as table
    }
);
```

**Output:**
```
👷 Workers (2/2)
═══════════════════════════════════════════════════════════

🟢 Worker 1: SD.3 User Authentication
   Progress: ████████░░ 75%
   Status: "Adding JWT refresh logic..."
   Time: 12m
   Next: SD.5 Settings Page

🟢 Worker 2: SD.4 Dashboard Layout
   Progress: ████░░░░░░ 40%
   Status: "Creating grid breakpoints..."
   Time: 8m
   Next: FE.2 Dashboard Components

═══════════════════════════════════════════════════════════
💡 Pause with chkd_pause_worker("worker-id")
💡 Stop with chkd_stop_worker("worker-id")
```

---

#### `chkd_pause_worker` / `chkd_resume_worker`

```typescript
server.tool(
    "chkd_pause_worker",
    "Pause a worker. It will stop after current operation.",
    {
        workerId: z.string().describe("Worker ID or number (e.g., '1' or 'worker-123')")
    },
    async ({ workerId }) => {
        // Call POST /api/workers/:id/pause
    }
);
```

---

#### `chkd_stop_worker`

```typescript
server.tool(
    "chkd_stop_worker",
    "Stop a worker and preserve its branch for later.",
    {
        workerId: z.string(),
        cleanup: z.boolean().optional().describe("Remove worktree too (default: false)")
    },
    async ({ workerId, cleanup }) => {
        // Call DELETE /api/workers/:id
    }
);
```

---

#### `chkd_merge_worker`

```typescript
server.tool(
    "chkd_merge_worker",
    "Merge a completed worker's branch. Auto-merges if clean, shows conflicts if not.",
    {
        workerId: z.string(),
        force: z.boolean().optional().describe("Merge even if conflicts (will use 'ours')")
    },
    async ({ workerId, force }) => {
        // Check conflicts
        // If clean or force: merge
        // If conflicts: show them, ask user
    }
);
```

---

### Manager Tech Lead Tools

#### `chkd_research`

```typescript
server.tool(
    "chkd_research",
    "Research codebase before assigning work. Explores patterns, dependencies, and structure.",
    {
        topic: z.string().describe("What to research (e.g., 'authentication', 'database patterns')"),
        depth: z.enum(['quick', 'thorough']).optional().describe("How deep to explore")
    },
    async ({ topic, depth }) => {
        // Search codebase for relevant files
        // Identify patterns and conventions
        // Find dependencies
        // Return summary
    }
);
```

**Output:**
```
🔍 Research: Authentication Patterns

Found existing patterns:
• Session management: src/lib/server/session.ts
• JWT utilities: src/lib/auth/jwt.ts (not present - would need to create)
• User model: src/lib/server/db/schema.sql (users table exists)

Dependencies:
• better-sqlite3 for database
• No existing auth library

Conventions:
• API routes in src/routes/api/
• Server utils in src/lib/server/
• Types in src/lib/types.ts

Recommendation:
Create JWT auth following existing patterns. Estimated: 2 worker tasks.
```

---

#### `chkd_write_story`

```typescript
server.tool(
    "chkd_write_story",
    "Create a detailed story/spec from a user request. Breaks into worker tasks.",
    {
        request: z.string().describe("User's request in natural language"),
        area: z.enum(['SD', 'FE', 'BE', 'MW']).optional().describe("Area code")
    },
    async ({ request, area }) => {
        // Parse request
        // Research codebase (calls chkd_research internally)
        // Generate structured story
        // Break into sub-tasks
        // Return for approval
    }
);
```

**Output:**
```
📝 Story Draft: User Authentication

From request: "Add login and logout"

## SD.X User Authentication
> As a user, I want to log in and out so that my data is secure.

**Acceptance Criteria:**
- [ ] User can log in with email/password
- [ ] User can log out
- [ ] Session persists across page refresh
- [ ] Invalid credentials show error

**Sub-tasks for Workers:**
1. Backend: Auth API endpoints (POST /login, POST /logout, GET /me)
2. Backend: JWT token generation and validation
3. Frontend: Login form component
4. Frontend: Auth state management
5. Frontend: Protected route wrapper

**Estimated:** 2 workers, ~30 min each

─────────────────────────
Approve this story? [Yes] [Edit] [Cancel]
```

---

#### `chkd_review_worker`

```typescript
server.tool(
    "chkd_review_worker",
    "Review a worker's completed code before merge.",
    {
        workerId: z.string().describe("Worker ID to review")
    },
    async ({ workerId }) => {
        // Get worker's branch
        // Pull changes
        // Analyze diff
        // Check quality
        // Return review
    }
);
```

**Output (approved):**
```
📋 Code Review: Worker 1 (SD.3 User Auth)

Branch: feature/alex/sd3-user-auth
Files changed: 8
Lines: +245, -12

✅ Quality Checks:
• Code patterns: Follows existing conventions ✓
• Error handling: Present ✓
• Types: Properly typed ✓
• Tests: 3 tests added ✓

📄 Changes Summary:
• src/routes/api/auth/login/+server.ts (new)
• src/routes/api/auth/logout/+server.ts (new)
• src/lib/server/auth/jwt.ts (new)
• src/lib/types.ts (+15 lines)

🎯 Acceptance Criteria:
• [x] User can log in with email/password
• [x] User can log out
• [x] Session persists
• [x] Invalid credentials show error

✅ APPROVED - Ready to merge
```

**Output (needs changes):**
```
📋 Code Review: Worker 1 (SD.3 User Auth)

⚠️ Issues Found:

1. Missing error handling in login endpoint
   src/routes/api/auth/login/+server.ts:45
   → Add try/catch around database query

2. No input validation
   → Add zod schema for login request

3. JWT secret hardcoded
   src/lib/server/auth/jwt.ts:12
   → Move to environment variable

❌ NEEDS CHANGES - Sending feedback to worker
```

---

#### `chkd_document`

```typescript
server.tool(
    "chkd_document",
    "Update documentation after work is merged.",
    {
        taskId: z.string().describe("Task that was completed"),
        taskTitle: z.string(),
        changes: z.string().describe("Summary of what changed")
    },
    async ({ taskId, taskTitle, changes }) => {
        // Update README if needed
        // Add CHANGELOG entry
        // Update API docs
        // Commit docs
    }
);
```

**Output:**
```
📚 Documentation Updated

README.md:
• Added "Authentication" section under Features
• Added login/logout API endpoints to API Reference

CHANGELOG.md:
• Added entry: "feat: Add user authentication (login/logout)"

API.md:
• Added POST /api/auth/login endpoint docs
• Added POST /api/auth/logout endpoint docs
• Added GET /api/auth/me endpoint docs

✅ Docs committed: "docs: Add authentication documentation"
```

---

### Worker Claude Tools

#### `chkd_worker_claim`

```typescript
server.tool(
    "chkd_worker_claim",
    "Claim your assigned task. Call this when you start in a worktree.",
    {},
    async () => {
        // Detect worktree from cwd
        // Find worker record by worktree_path
        // Update status: waiting -> working
        // Return task details
    }
);
```

**Output:**
```
✅ Claimed task: SD.3 User Authentication

You're working in: ../myproject-worker-1
Branch: feature/sd3-user-authentication

📋 Task Details:
User authentication with JWT tokens, login/logout, session management.

Sub-tasks:
- [ ] Design API endpoints
- [ ] Implement login endpoint
- [ ] Implement logout endpoint
- [ ] Add JWT token generation
- [ ] Add session middleware

💡 Send progress updates with chkd_worker_heartbeat()
💡 When done, call chkd_worker_complete()
```

---

#### `chkd_worker_heartbeat`

```typescript
server.tool(
    "chkd_worker_heartbeat",
    "Send a progress update. Call every few minutes or when you make progress.",
    {
        message: z.string().describe("What you're working on"),
        progress: z.number().optional().describe("Estimated progress 0-100")
    },
    async ({ message, progress }) => {
        // Call PATCH /api/workers/:id
        // Return any instructions (pause requested, etc.)
    }
);
```

**Output (normal):**
```
💓 Heartbeat sent
Status: "Adding JWT refresh logic..."
Progress: 75%

Keep going! Next heartbeat in a few minutes.
```

**Output (pause requested):**
```
💓 Heartbeat sent

⏸️ PAUSE REQUESTED
The coordinator has asked you to pause.
Please stop after your current operation.

Call chkd_worker_heartbeat() again when ready to check if resumed.
```

---

#### `chkd_worker_complete`

```typescript
server.tool(
    "chkd_worker_complete",
    "Signal that your task is complete. Triggers merge check.",
    {
        message: z.string().optional().describe("Final status message")
    },
    async ({ message }) => {
        // Call POST /api/workers/:id/complete
        // Return merge status
    }
);
```

**Output (clean merge):**
```
✅ Task complete: SD.3 User Authentication

🔄 Checking for merge conflicts...
✅ No conflicts! Merging to main...
✅ Merged successfully!

📊 Stats: 8 files changed, 245 insertions, 12 deletions

🔜 Next task: SD.5 Settings Page
   Starting automatically...
```

**Output (conflicts):**
```
✅ Task complete: SD.3 User Authentication

🔄 Checking for merge conflicts...
⚠️ Conflicts detected!

Conflicts in:
• src/App.svelte (3 lines)
• src/routes/+layout.svelte (1 line)

The coordinator will help resolve these.
Please wait for instructions.
```

---

## 8. UI Components

### Component: `WorkerStrip.svelte`

High-level worker summary shown in repo card.

```svelte
<script lang="ts">
    export let workers: Worker[];
    export let maxWorkers: number;

    $: activeCount = workers.filter(w =>
        ['working', 'waiting', 'paused', 'merging'].includes(w.status)
    ).length;
</script>

<div class="worker-strip">
    <div class="header">
        <span class="title">👷 WORKERS ({activeCount}/{maxWorkers})</span>
        {#if activeCount >= maxWorkers}
            <span class="badge max">MAX</span>
        {:else}
            <button class="spawn-btn">+ Spawn</button>
        {/if}
    </div>

    <div class="workers">
        {#each workers as worker}
            <div class="worker-mini">
                <span class="status-icon">{getStatusIcon(worker.status)}</span>
                <span class="task">{worker.taskId}: {truncate(worker.taskTitle, 12)}</span>
                <div class="progress-bar">
                    <div class="fill" style="width: {worker.progress}%"></div>
                </div>
                <span class="message">{truncate(worker.message, 20)}</span>
            </div>
        {/each}
    </div>
</div>
```

### Component: `SplitBrainView.svelte`

Full side-by-side worker view.

```svelte
<script lang="ts">
    export let workers: Worker[];
    export let signals: ManagerSignal[];
</script>

<div class="split-brain-view">
    <!-- Manager Signal Bar -->
    <ManagerSignalBar {signals} />

    <!-- Worker Panels -->
    <div class="panels">
        {#each [0, 1] as slot}
            {#if workers[slot]}
                <WorkerPanel worker={workers[slot]} />
            {:else}
                <EmptyWorkerSlot on:spawn />
            {/if}
        {/each}
    </div>

    <!-- Task Queue -->
    <TaskQueue />
</div>
```

### Component: `WorkerPanel.svelte`

Individual worker detail panel.

```svelte
<script lang="ts">
    export let worker: Worker;
</script>

<div class="worker-panel" class:conflict={worker.status === 'conflict'}>
    <div class="header">
        <span class="icon">🧠</span>
        <span class="title">WORKER {worker.number}</span>
        <span class="status-badge {worker.status}">{worker.status}</span>
    </div>

    <!-- Current Task -->
    <div class="current-task">
        <div class="label">📌 CURRENT</div>
        <div class="task-name">{worker.taskId} {worker.taskTitle}</div>
        <ProgressBar value={worker.progress} />
    </div>

    <!-- Status Message -->
    <div class="message">
        <span class="quote">💭</span>
        "{worker.message}"
    </div>

    <!-- Recently Touched Files -->
    <div class="files">
        <div class="label">Recently touched:</div>
        <ul>
            {#each worker.recentFiles as file}
                <li>• {file}</li>
            {/each}
        </ul>
    </div>

    <!-- Elapsed Time -->
    <div class="time">
        ⏱️ {formatDuration(worker.elapsedMs)}
    </div>

    <hr />

    <!-- Next in Queue -->
    <div class="next-queue">
        <div class="label">📋 NEXT IN QUEUE</div>
        {#if worker.nextTaskId}
            <div class="next-task">
                {worker.nextTaskId} {worker.nextTaskTitle}
            </div>
        {:else}
            <div class="no-next">No task queued</div>
        {/if}
    </div>

    <!-- Actions -->
    <div class="actions">
        {#if worker.status === 'working'}
            <button on:click={pause}>Pause</button>
            <button on:click={stop}>Stop</button>
        {:else if worker.status === 'paused'}
            <button on:click={resume}>Resume</button>
            <button on:click={stop}>Stop</button>
        {/if}
        <button on:click={viewCode}>View Code</button>
    </div>
</div>
```

### Component: `ManagerSignalBar.svelte`

```svelte
<script lang="ts">
    export let signals: ManagerSignal[];

    $: latestSignal = signals[0];  // Most recent
    $: actionRequired = signals.filter(s => s.actionRequired);
</script>

{#if latestSignal}
    <div class="manager-signal" class:action-required={latestSignal.actionRequired}>
        <div class="icon">🤖</div>
        <div class="content">
            <div class="message">{latestSignal.message}</div>

            {#if latestSignal.actionRequired && latestSignal.actionOptions}
                <div class="actions">
                    {#each latestSignal.actionOptions as option}
                        <button on:click={() => takeAction(latestSignal.id, option)}>
                            {option}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        {#if !latestSignal.actionRequired}
            <button class="dismiss" on:click={() => dismiss(latestSignal.id)}>×</button>
        {/if}
    </div>
{/if}
```

### Component: `ConflictModal.svelte`

```svelte
<script lang="ts">
    export let conflict: ConflictInfo;
    export let onResolve: (resolution: string) => void;
</script>

<div class="modal-overlay">
    <div class="conflict-modal">
        <h2>⚠️ Merge Conflict</h2>
        <p class="file">📄 {conflict.file}</p>

        <div class="diff-view">
            <div class="side ours">
                <div class="label">Main branch (current)</div>
                <pre>{conflict.oursContent}</pre>
            </div>
            <div class="side theirs">
                <div class="label">Worker's changes</div>
                <pre>{conflict.theirsContent}</pre>
            </div>
        </div>

        <div class="actions">
            <button on:click={() => onResolve('ours')}>Keep Main</button>
            <button on:click={() => onResolve('theirs')}>Keep Worker</button>
            <button on:click={() => onResolve('both')}>Keep Both</button>
            <button on:click={() => onResolve('manual')}>Open in Editor</button>
        </div>
    </div>
</div>
```

---

## 9. Manager AI Logic

### When to Create Signals

| Event | Signal Type | Message Template |
|-------|-------------|------------------|
| Worker starts | status | "Worker {N} started on {task}" |
| Worker progress milestone (25/50/75%) | status | "Worker {N}: {task} at {progress}%" |
| Worker completes, merging | status | "Worker {N} completed {task}. Merging..." |
| Merge successful | decision | "✅ {task} merged! {stats}" |
| Conflict detected | help | "⚠️ Conflict in {files}. Need your help." |
| Worker stuck (no progress 10min) | warning | "Worker {N} may be stuck. No progress in 10min." |
| Worker dead (no heartbeat 2min) | warning | "⚠️ Worker {N} not responding. May have crashed." |
| Slot available | suggestion | "💡 Slot available. Recommend: {nextTask}" |
| All tasks complete | status | "📊 All done! {summary}" |

### Auto-Actions (No User Input Needed)

1. **Auto-merge when clean** - If no conflicts, merge automatically
2. **Auto-assign next task** - When worker finishes, assign from queue
3. **Auto-cleanup worktree** - After successful merge, remove worktree
4. **Dead worker cleanup** - If no heartbeat for 5min, mark as error

### Decisions Requiring User Input

1. **Merge conflicts** - Show conflict UI
2. **Worker stuck** - Offer: investigate, pause, abort
3. **Ambiguous next task** - Multiple tasks available, ask preference

---

## 10. Error Handling

### Worker Errors

| Error | Detection | Response |
|-------|-----------|----------|
| Worker crashes | No heartbeat for 2min | Mark error, preserve branch, alert user |
| Git conflict on commit | Worker reports error | Surface to user, suggest stash/resolve |
| Worktree corrupted | Git operations fail | Alert user, offer cleanup + retry |
| Network error | API calls fail | Retry 3x, then alert user |

### Merge Errors

| Error | Detection | Response |
|-------|-----------|----------|
| Conflict in binary file | Git reports binary | Alert user, can't auto-resolve |
| Deleted file conflict | File deleted on one side | Show options: keep, delete, restore |
| Merge commit fails | Git returns error | Abort, preserve state, alert user |

### Recovery Procedures

**Dead Worker Recovery:**
```
1. Detect: No heartbeat > 2min
2. Mark worker status: 'error'
3. Create signal: "Worker {N} not responding"
4. Preserve worktree + branch
5. Offer actions: "Retry" (respawn), "Cleanup" (remove)
```

**Failed Merge Recovery:**
```
1. Detect: Merge command fails
2. Run: git merge --abort
3. Mark worker status: 'error'
4. Create signal with error details
5. Preserve branch for investigation
6. Offer: "Retry", "Manual merge", "Abort task"
```

---

## 11. Security & Safety

### Git Safety

1. **Never force push** - All operations are safe merges
2. **Preserve branches** - On error, keep branch for recovery
3. **Backup before merge** - Tag current HEAD before merging
4. **Verify clean state** - Check no uncommitted changes before merge

### Database Safety

1. **Atomic operations** - Use transactions for multi-step updates
2. **Foreign key constraints** - Ensure referential integrity
3. **Status validation** - Only allow valid status transitions

### User Safety

1. **Confirmation for destructive actions** - Cleanup, abort
2. **Undo period** - Can restore branch within 24h
3. **Audit trail** - All actions logged in worker_history

### Resource Limits

1. **Max 2 workers** - Prevent runaway resource usage
2. **Heartbeat timeout** - Detect and cleanup dead workers
3. **Worktree cleanup** - Auto-cleanup after 24h if not active

---

## 12. Implementation Order

### Phase 1: Foundation (Estimated: 1 week)

**Day 1-2: Database**
- [ ] Create workers table migration
- [ ] Create worker_history table migration
- [ ] Create manager_signals table migration
- [ ] Add worker_id to sessions table
- [ ] Write TypeScript types for all entities

**Day 3-4: Git Utilities**
- [ ] Implement createWorktree()
- [ ] Implement removeWorktree()
- [ ] Implement listWorktrees()
- [ ] Implement checkConflicts()
- [ ] Implement mergeBranch()
- [ ] Write tests for git utilities

**Day 5: Basic API**
- [ ] POST /api/workers/spawn
- [ ] GET /api/workers
- [ ] DELETE /api/workers/:id
- [ ] Test with curl/httpie

### Phase 2: Worker Flow (Estimated: 1 week)

**Day 1-2: Worker Lifecycle**
- [ ] PATCH /api/workers/:id (heartbeat)
- [ ] POST /api/workers/:id/complete
- [ ] POST /api/workers/:id/pause
- [ ] POST /api/workers/:id/resume

**Day 3-4: MCP Tools**
- [ ] chkd_spawn_worker (master)
- [ ] chkd_workers (master)
- [ ] chkd_worker_claim (worker)
- [ ] chkd_worker_heartbeat (worker)
- [ ] chkd_worker_complete (worker)

**Day 5: Basic UI**
- [ ] WorkerStrip component (repo card)
- [ ] Enhanced repo card with workers
- [ ] Spawn button + modal

### Phase 3: Split Brain & Signals (Estimated: 1 week)

**Day 1-2: Manager Signals**
- [ ] Manager signal table queries
- [ ] GET /api/manager/signals
- [ ] POST /api/manager/signals/:id/dismiss
- [ ] Signal creation on events

**Day 3-4: Split Brain View**
- [ ] SplitBrainView component
- [ ] WorkerPanel component
- [ ] ManagerSignalBar component
- [ ] EmptyWorkerSlot component

**Day 5: Polish**
- [ ] TaskQueue component
- [ ] Real-time updates (polling)
- [ ] Status transitions in UI

### Phase 4: Merge & Conflicts (Estimated: 1 week)

**Day 1-2: Auto-Merge**
- [ ] Conflict detection on complete
- [ ] Auto-merge when clean
- [ ] Worktree cleanup after merge

**Day 3-4: Conflict Resolution**
- [ ] ConflictModal component
- [ ] POST /api/workers/:id/resolve
- [ ] Resolution strategies (ours/theirs/both)

**Day 5: Edge Cases**
- [ ] Dead worker detection
- [ ] Error recovery flows
- [ ] Audit logging

---

## Appendix A: File Locations

```
src/
├── lib/
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.sql          # Add worker tables
│   │   │   └── queries.ts          # Add worker queries
│   │   └── git/
│   │       └── worktree.ts         # NEW: Git worktree utilities
│   ├── components/
│   │   ├── WorkerStrip.svelte      # NEW
│   │   ├── WorkerPanel.svelte      # NEW
│   │   ├── SplitBrainView.svelte   # NEW
│   │   ├── ManagerSignalBar.svelte # NEW
│   │   └── ConflictModal.svelte    # NEW
│   └── types.ts                    # Add Worker, Signal types
├── routes/
│   └── api/
│       ├── workers/
│       │   ├── +server.ts          # NEW: GET, POST workers
│       │   └── [workerId]/
│       │       ├── +server.ts      # NEW: PATCH, DELETE worker
│       │       ├── complete/
│       │       │   └── +server.ts  # NEW
│       │       ├── pause/
│       │       │   └── +server.ts  # NEW
│       │       ├── resume/
│       │       │   └── +server.ts  # NEW
│       │       └── resolve/
│       │           └── +server.ts  # NEW
│       └── manager/
│           └── signals/
│               ├── +server.ts      # NEW: GET signals
│               └── [signalId]/
│                   └── +server.ts  # NEW: dismiss, action
└── mcp/
    └── server-http.ts              # Add worker tools
```

---

## Appendix B: Example Manager Signal Messages

**Status Updates:**
```
"Worker 1 started on SD.3: User Authentication"
"Worker 1 at 50% - implementing login endpoint"
"Worker 2 at 75% - adding responsive breakpoints"
"Both workers progressing well. Estimated completion: 15 min"
```

**Decisions Made:**
```
"✅ SD.3 merged to main! 8 files changed, 245 insertions"
"✅ Auto-assigned SD.5 to Worker 1"
"✅ Cleaned up worktree for Worker 2"
```

**Help Needed:**
```
"⚠️ Conflict in src/App.svelte - both workers modified navigation"
"⚠️ Worker 1 stuck - no progress in 10 minutes"
"⚠️ Worker 2 not responding - may have crashed"
```

**Suggestions:**
```
"💡 Worker slot available. Recommend spawning for FE.2 (no dependencies)"
"💡 SD.4 depends on SD.3 - wait for Worker 1 to complete"
```

---

## Appendix C: Status Badge Colors

| Status | Color | Icon |
|--------|-------|------|
| pending | Gray | ⏳ |
| waiting | Yellow | 🟡 |
| working | Green | 🟢 |
| paused | Gray | ⏸️ |
| merging | Blue | 🔄 |
| merged | Green | ✅ |
| error | Red | 🔴 |
| conflict | Orange | ⚠️ |

---

**END OF SPECIFICATION**

Ready for review!
