# Multi-Claude Parallel Development System
## Design Document

**Status:** Research & Design Phase
**Created:** 2026-01-23
**Goal:** Enable multiple Claude instances to work in parallel using git worktrees, coordinating through chkd

---

## 🎯 Vision

Enable 2-5 Claude instances to work simultaneously on different tasks in the same codebase:
- Each Claude works in its own git worktree (isolated file state)
- Claudes coordinate via shared chkd database/API
- UI shows all active Claudes and their progress
- Work gets merged back automatically or with supervision

**Example:** Claude #1 refactors auth, Claude #2 builds dashboard, Claude #3 fixes bugs - all at once!

---

## 📚 Research Findings

### Git Worktrees for Parallel Development

**What They Are:**
Git worktrees let you check out multiple branches in separate directories without duplicating the repo. All worktrees share the same .git data.

**Best Practices (2025-2026):**
- Directory pattern: `~/project/` (main), `project-feature-name/` (worktrees)
- Treat as temporary: create for task, remove when done
- One branch per worktree (enforced by git)
- **People are already using this with Claude!** Teams report 4-5 Claude instances in parallel

**Key Benefits:**
- No file conflicts between instances
- Lightweight (shared .git)
- Each Claude has independent file state
- Easy cleanup with `git worktree remove`

**Sources:**
- [Mastering Git Worktrees with Claude Code](https://medium.com/@dtunai/mastering-git-worktrees-with-claude-code-for-parallel-development-workflow-41dc91e645fe)
- [Git Worktrees: Secret Weapon for Multiple AI Agents](https://medium.com/@mabd.dev/git-worktrees-the-secret-weapon-for-running-multiple-ai-coding-agents-in-parallel-e9046451eb96)
- [Parallel AI Development with Git Worktrees](https://medium.com/@ooi_yee_fei/parallel-ai-development-with-git-worktrees-f2524afc3e33)

### Multi-Agent AI Coordination Patterns

**Three Main Patterns:**

1. **Supervisor (Hierarchical)**
   - Central orchestrator coordinates everything
   - Master receives requests, decomposes tasks, delegates to workers
   - Workers report back to supervisor
   - **Best for:** Complex coordination, safety-critical work

2. **Adaptive Network (Peer-to-Peer)**
   - No central control
   - Agents collaborate directly based on expertise
   - Each agent can execute, delegate, or enrich tasks
   - **Best for:** Dynamic work distribution, fault tolerance

3. **Hybrid (Supervisor + Local Mesh)**
   - High-level orchestrator for strategy
   - Local agent networks for tactical execution
   - **Emerging as the winning pattern** for enterprise
   - **Best for:** Balancing control with autonomy

**Market Insights:**
- Multi-agent systems achieve 45% faster resolution vs single agent
- Organizations report work completed in hours vs days
- Gartner: 1,445% surge in multi-agent inquiries (Q1 2024 → Q2 2025)

**Sources:**
- [AI Agent Orchestration Patterns - Microsoft Azure](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Multi-Agent AI Orchestration Enterprise Strategy 2025-2026](https://www.onabout.ai/p/mastering-multi-agent-orchestration-architectures-patterns-roi-benchmarks-for-2025-2026)
- [Kore.ai: Choosing Right Orchestration Pattern](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)

### Node.js Process Management & IPC

**Key Capabilities:**
- `child_process.fork()` spawns Node processes with IPC channel
- Unix/Windows sockets are fastest for same-machine communication
- Each process has own memory/V8 instance (no shared state)
- Message passing for coordination (not shared memory)

**For Shared State:**
- External stores (Redis, SQLite, etc.)
- Master process coordination pattern
- IPC message passing with state synchronization

**Sources:**
- [Node.js Child Process Official Docs](https://nodejs.org/api/child_process.html)
- [IPC Performance in Node.js - 60devs](https://60devs.com/performance-of-inter-process-communications-in-nodejs.html)
- [Inter Process Communication in Node.js - CodeForGeek](https://codeforgeek.com/inter-process-communication-in-nodejs/)

### Claude API Concurrent Usage

**Capabilities:**
- Claude API supports multiple concurrent conversations
- Use async/await + Promise.all() for parallel requests
- Multiple Claude Code sessions can run simultaneously
- Each session needs isolated environment (worktree!)

**Limits:**
- 5-hour rolling window for burst activity
- 7-day weekly ceiling for total compute hours
- Max plans: 50 sessions/month before throttling
- 200K-1M token context windows

**Critical Insight:**
> "Claude Code doesn't manage state, handle concurrency, or isolate compute - git worktrees isolate your source code, but agents still fight over same resources"

This is WHY we need chkd to coordinate!

**Sources:**
- [Going Async with Claude Agents - CodeSignal](https://codesignal.com/learn/courses/parallelizing-claude-agentic-systems-in-python/lessons/concurrent-agent-conversations)
- [Running Multiple Claude Code Sessions in Parallel](https://dev.to/datadeer/part-2-running-multiple-claude-code-sessions-in-parallel-with-git-worktree-165i)
- [How to Run Multiple Claude Sessions in Parallel](https://jewelhuq.medium.com/how-to-run-multiple-claude-sessions-in-parallel-simple-step-by-step-01a32594bda2)

---

## 🏗️ Proposed Architecture

### Option A: Supervisor Pattern (RECOMMENDED)

```
┌─────────────────────────────────────────────┐
│         Master Claude (Orchestrator)        │
│  - Reads spec, assigns tasks                │
│  - Creates worktrees                        │
│  - Monitors workers                         │
│  - Handles merges                           │
└───────────┬─────────────────────────────────┘
            │
            │ (spawns & coordinates)
            │
    ┌───────┴───────┬───────────────┐
    │               │               │
┌───▼───┐      ┌───▼───┐      ┌───▼───┐
│Worker │      │Worker │      │Worker │
│  #1   │      │  #2   │      │  #3   │
│       │      │       │      │       │
│Task:  │      │Task:  │      │Task:  │
│SD.1   │      │SD.2   │      │Bug #42│
└───┬───┘      └───┬───┘      └───┬───┘
    │              │              │
    │              │              │
┌───▼──────────────▼──────────────▼───┐
│        Git Worktrees                │
│                                     │
│  chkd-worker-1/  (branch: SD.1)    │
│  chkd-worker-2/  (branch: SD.2)    │
│  chkd-worker-3/  (branch: bug-42)  │
└─────────────────────────────────────┘
            │
            │ (all share)
            │
┌───────────▼─────────────────────────┐
│      Shared chkd Database           │
│  - workers table                    │
│  - task assignments                 │
│  - status tracking                  │
└─────────────────────────────────────┘
```

**How It Works:**

1. **Master Claude:**
   - Runs as primary chkd session
   - Has special MCP tools: `spawn_worker()`, `assign_task()`, `merge_worker()`
   - Creates git worktrees for each task
   - Spawns worker Claude processes
   - Monitors progress via database polling
   - Handles merge conflicts and final integration

2. **Worker Claudes:**
   - Spawned as child processes (or separate Claude Code sessions)
   - Each gets own worktree path as working directory
   - Use standard chkd MCP tools (`chkd_status`, `chkd_tick`, etc.)
   - Report progress back via database updates
   - When done, signal completion and wait for merge

3. **Coordination:**
   - Shared SQLite database (chkd.db)
   - HTTP API for status updates (already built!)
   - Workers poll for instructions (pause, continue, abort)
   - Master polls for worker status

**Pros:**
- ✅ Clear hierarchy and responsibility
- ✅ Master can enforce safety (review before merge)
- ✅ Easy to debug (follow master's decisions)
- ✅ Can pause/intervene easily

**Cons:**
- ❌ Master is bottleneck
- ❌ Master needs to be sophisticated
- ❌ Workers are passive (less autonomous)

---

### Option B: Peer-to-Peer with Task Queue

```
┌─────────────────────────────────────┐
│         Task Queue (Database)       │
│  - Available tasks from spec        │
│  - Status: pending/claimed/done     │
│  - Worker assignment tracking       │
└──────────┬──────────────────────────┘
           │
           │ (all workers pull from queue)
           │
    ┌──────┼──────┬──────────────┐
    │      │      │              │
┌───▼───┐ ┌▼────┐ ┌▼───────┐ ┌──▼────┐
│Claude │ │Claude│ │Claude  │ │Claude │
│  #1   │ │  #2 │ │  #3    │ │  #4   │
│(peer) │ │(peer)│ │(peer)  │ │(peer) │
└───┬───┘ └──┬──┘ └──┬─────┘ └───┬───┘
    │        │       │            │
    │        │       │            │
┌───▼────────▼───────▼────────────▼──┐
│        Git Worktrees                │
│  claude-1/  claude-2/  claude-3/   │
└────────────────────────────────────┘
```

**How It Works:**

1. **Task Queue:**
   - All spec tasks loaded into queue
   - Each task marked: pending → claimed → in_progress → done
   - Atomic claim operation (SQL: UPDATE ... WHERE status='pending' LIMIT 1)

2. **Each Claude (Equal Peers):**
   - Starts up, claims a task from queue
   - Creates own worktree: `git worktree add ../chkd-claude-1 -b task-{id}`
   - Works on task independently
   - When done: commits, pushes branch, marks task done
   - Claims next task and repeats

3. **Merge Strategy:**
   - Each Claude merges own work when done (optimistic)
   - OR: One designated Claude becomes "merger" when it finishes (role rotation)
   - Conflicts handled by pausing and alerting user

**Pros:**
- ✅ No single point of failure
- ✅ Dynamic load balancing (fast workers claim more)
- ✅ Scales easily (add more Claudes)
- ✅ Simple design (no master logic)

**Cons:**
- ❌ Merge conflicts harder to resolve
- ❌ Less oversight (Claudes work autonomously)
- ❌ Harder to pause/coordinate mid-work
- ❌ Race conditions possible (need good locking)

---

### Option C: Hybrid (Supervisor + Worker Autonomy)

**Best of Both Worlds:**

- **Coordinator Claude:**
  - Assigns tasks strategically (considers dependencies)
  - Creates worktrees
  - Monitors progress
  - BUT: Workers make tactical decisions

- **Worker Claudes:**
  - Accept assignments
  - Plan and execute independently
  - Report milestones (not micro-updates)
  - Can request help from coordinator
  - Merge own work when safe

**When to Use:**
- Complex projects with dependencies
- Need safety but also speed
- Want to scale to 5+ workers

**Pros:**
- ✅ Balance of control and autonomy
- ✅ Scales better than pure supervisor
- ✅ Safer than pure peer-to-peer

**Cons:**
- ❌ Most complex to implement
- ❌ Requires smart coordinator logic

---

## 🗄️ Database Schema

Extend existing chkd database with worker tracking:

```sql
-- New table: workers
CREATE TABLE workers (
  id TEXT PRIMARY KEY,           -- worker-{timestamp}-{random}
  repo_id INTEGER NOT NULL,
  status TEXT NOT NULL,          -- idle, working, paused, done, error
  worktree_path TEXT,            -- ../chkd-worker-1
  branch_name TEXT,              -- feature/SD.1
  task_id TEXT,                  -- SD.1
  task_title TEXT,               -- "User authentication"
  process_id INTEGER,            -- PID of worker process (if applicable)
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  heartbeat_at INTEGER,          -- Last ping (detect dead workers)

  FOREIGN KEY (repo_id) REFERENCES repos(id)
);

-- New table: task_queue (for peer-to-peer)
CREATE TABLE task_queue (
  id TEXT PRIMARY KEY,           -- task-{spec-id}
  repo_id INTEGER NOT NULL,
  spec_item_id TEXT NOT NULL,    -- SD.1
  title TEXT NOT NULL,
  status TEXT NOT NULL,          -- pending, claimed, in_progress, done, failed
  claimed_by TEXT,               -- worker-id
  priority INTEGER DEFAULT 0,
  dependencies TEXT,             -- JSON array of task IDs
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  completed_at INTEGER,

  FOREIGN KEY (repo_id) REFERENCES repos(id),
  FOREIGN KEY (claimed_by) REFERENCES workers(id)
);

-- Extend sessions table
ALTER TABLE sessions ADD COLUMN worker_id TEXT REFERENCES workers(id);
ALTER TABLE sessions ADD COLUMN is_master BOOLEAN DEFAULT 0;
```

---

## 🔧 API Endpoints (New)

Add to existing SvelteKit API:

```typescript
// POST /api/workers/spawn
// Create new worker, assign task, create worktree
{
  repoPath: string,
  taskId: string,
  taskTitle: string
}
→ { workerId, worktreePath, branchName }

// GET /api/workers
// List all workers for repo
{ repoPath: string }
→ { workers: Worker[] }

// PATCH /api/workers/{workerId}
// Update worker status (heartbeat, progress, completion)
{
  status: 'working' | 'done' | 'error',
  heartbeat?: number,
  message?: string
}

// DELETE /api/workers/{workerId}
// Remove worker, cleanup worktree
{ force: boolean }

// POST /api/workers/{workerId}/merge
// Merge worker's branch back to main
{ strategy: 'auto' | 'review' }

// POST /api/tasks/claim
// Atomic claim operation for peer-to-peer
{ repoPath, workerId }
→ { task: Task | null }
```

---

## 🎨 UI Design

### Dashboard Enhancement: Worker Strip

Add below the repo card strip:

```
┌────────────────────────────────────────────────────────┐
│  👷 WORKERS (3 active)                    [+ Spawn]     │
├────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│  │ Worker 1│  │ Worker 2│  │ Worker 3│                 │
│  │   🟢    │  │   🟢    │  │   🟡    │                 │
│  ├─────────┤  ├─────────┤  ├─────────┤                 │
│  │ SD.1    │  │ SD.2    │  │ Bug #42 │                 │
│  │ Auth    │  │Dashboard│  │ Login   │                 │
│  │ 15m     │  │ 8m      │  │ Paused  │                 │
│  │ [View]  │  │ [View]  │  │[Resume] │                 │
│  └─────────┘  └─────────┘  └─────────┘                 │
│                                                         │
└────────────────────────────────────────────────────────┘
```

**Status Indicators:**
- 🟢 Working
- 🟡 Paused
- 🔴 Error
- ⚪ Idle
- ✅ Done (ready to merge)

**Actions:**
- View: Open worker's worktree in file browser
- Pause/Resume: Control worker
- Merge: Integrate worker's branch
- Abort: Stop and cleanup

### Real-time Updates

Workers update every 30s (heartbeat):
```typescript
// Frontend polls /api/workers
setInterval(async () => {
  const workers = await fetch('/api/workers?repoPath=...');
  updateWorkerStrip(workers);
}, 30000);
```

---

## 🛠️ MCP Tools (New)

### For Master Claude (Supervisor Mode):

```typescript
// chkd_spawn_worker - Create and assign worker
{
  taskId: "SD.1",
  taskTitle: "User authentication"
}
→ Worker created in ../chkd-worker-1, assigned SD.1

// chkd_workers - List active workers
{ }
→ Shows table of workers, status, tasks

// chkd_merge_worker - Merge worker's branch
{
  workerId: "worker-123",
  strategy: "auto" | "review"
}
→ Merges branch, cleans up worktree

// chkd_pause_worker / chkd_resume_worker
{ workerId: "worker-123" }
→ Sends signal to worker via database

// chkd_abort_worker - Stop and cleanup
{ workerId: "worker-123" }
→ Kills process, removes worktree
```

### For Worker Claudes:

```typescript
// chkd_heartbeat - Signal alive
{ message: "Implementing login endpoint" }
→ Updates worker status in DB

// chkd_worker_status - Check if paused/aborted
{ }
→ { status: 'working' | 'paused' | 'aborted' }

// chkd_complete_work - Signal done
{ }
→ Marks worker as done, ready for merge
```

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Database schema for workers & task queue
- [ ] API endpoints for worker CRUD operations
- [ ] Git worktree management utilities
- [ ] Basic UI for viewing workers (read-only)

### Phase 2: Supervisor Mode MVP (Week 3-4)
- [ ] MCP tool: `chkd_spawn_worker`
- [ ] Worker heartbeat system
- [ ] Master monitoring workers via polling
- [ ] Manual merge workflow (master triggers, handles conflicts)
- [ ] UI actions: view, pause, abort

### Phase 3: Worker Intelligence (Week 5-6)
- [ ] Worker Claudes report progress automatically
- [ ] Conflict detection before merge
- [ ] Automatic branch creation/naming
- [ ] Worker error recovery (retry, escalate)

### Phase 4: Peer-to-Peer Mode (Week 7-8)
- [ ] Task queue implementation
- [ ] Atomic claim operations
- [ ] Self-service: workers create own worktrees
- [ ] Merge automation (optimistic merging)

### Phase 5: Advanced Features (Week 9+)
- [ ] Dependency management (task A before B)
- [ ] Priority queues (critical tasks first)
- [ ] Smart assignment (match task to capability)
- [ ] Cost tracking (token usage per worker)
- [ ] Performance metrics (worker velocity)
- [ ] Auto-scaling (spawn more if queue grows)

---

## 🚧 Challenges & Mitigations

### 1. **Merge Conflicts**

**Challenge:** Multiple workers changing same files

**Mitigations:**
- Assign tasks with low coupling (separate modules)
- Detect conflicts before merge (git merge --no-commit --no-ff)
- Master reviews all merges initially
- Build dependency graph from spec

### 2. **Process Management**

**Challenge:** Spawning/monitoring multiple Claude processes

**Mitigations:**
- Use `child_process.fork()` for Node workers
- OR: Use separate Claude Code windows (user-managed)
- Heartbeat system detects dead workers (cleanup orphans)
- Graceful shutdown signals

### 3. **Resource Contention**

**Challenge:** Workers accessing shared resources (DB, files)

**Mitigations:**
- Workers write to separate worktrees (no file conflicts)
- Database uses WAL mode (concurrent reads/writes)
- API rate limiting per worker

### 4. **Claude API Limits**

**Challenge:** 5-hour rolling window, 50 sessions/month

**Mitigations:**
- Warn user before spawning (show current usage)
- Limit max concurrent workers (start with 2-3)
- Priority queue: important tasks first
- Option to pause all workers if limit approaching

### 5. **State Synchronization**

**Challenge:** Workers need to see each other's progress

**Mitigations:**
- Shared database as source of truth
- Workers poll for updates (30s interval)
- Master can broadcast messages via database flags
- Eventual consistency is OK (workers are isolated)

### 6. **User Confusion**

**Challenge:** Multiple Claudes working can be disorienting

**Mitigations:**
- Clear UI showing "who's doing what"
- Notifications for important events (worker done, conflict, error)
- Master Claude summarizes overall progress
- User can pause all workers with one click

### 7. **Testing**

**Challenge:** Hard to test multi-agent system

**Mitigations:**
- Simulate workers with scripts (fake Claude)
- Manual testing with 2 real Claude sessions
- Test merge conflict scenarios explicitly
- Monitor logs from all workers

---

## 💡 Quick Start (MVP Path)

**Simplest way to prove concept:**

1. **Spawn Workers Manually**
   - User opens 2-3 Claude Code windows
   - Each gets assigned a task manually
   - Each works in separate worktree (user creates)

2. **Coordination via chkd**
   - Each Claude calls `chkd_working("SD.1")` etc.
   - Database tracks what each is doing
   - UI shows all active sessions

3. **Merge Manually**
   - User merges branches themselves
   - chkd tracks completion

**Why This First:**
- ✅ No process spawning complexity
- ✅ Tests worktree workflow
- ✅ Validates coordination via database
- ✅ User maintains control

**Then Automate:**
- Add `chkd_spawn_worker` to launch new sessions
- Add automatic merge detection
- Add conflict resolution tools

---

## 📊 Success Metrics

**How we'll know it works:**

- **Speed:** 2-3x faster completion of multi-task specs
- **Throughput:** Complete 5 tasks in parallel vs 1 at a time
- **Reliability:** <5% merge conflict rate
- **Usability:** User can spawn/manage workers without CLI
- **Visibility:** User always knows what's happening (UI)

---

## 🔮 Future Enhancements

### Advanced Coordination
- Workers can request help from each other
- Workers can sub-delegate (spawn sub-workers)
- Dynamic re-assignment if worker gets stuck

### Smart Scheduling
- ML model predicts task duration
- Optimize assignment based on dependencies
- Balance load across workers

### Multi-Repo
- Workers can work across multiple repos
- Coordinate changes in microservices

### Collaboration
- Multiple human users + multiple Claude workers
- User can "pair program" with any worker

---

## 📚 References

### Git Worktrees
- [Mastering Git Worktrees with Claude Code](https://medium.com/@dtunai/mastering-git-worktrees-with-claude-code-for-parallel-development-workflow-41dc91e645fe)
- [Git Worktrees: Secret Weapon for Multiple AI Agents](https://medium.com/@mabd.dev/git-worktrees-the-secret-weapon-for-running-multiple-ai-coding-agents-in-parallel-e9046451eb96)
- [Parallel AI Development with Git Worktrees](https://medium.com/@ooi_yee_fei/parallel-ai-development-with-git-worktrees-f2524afc3e33)
- [Using Git Worktrees for Concurrent Development](https://www.kenmuse.com/blog/using-git-worktrees-for-concurrent-development/)

### Multi-Agent Orchestration
- [AI Agent Orchestration Patterns - Microsoft Azure](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Multi-Agent AI Orchestration Enterprise Strategy](https://www.onabout.ai/p/mastering-multi-agent-orchestration-architectures-patterns-roi-benchmarks-for-2025-2026)
- [Choosing Right Orchestration Pattern](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)
- [Top 10+ Agentic Orchestration Frameworks 2026](https://research.aimultiple.com/agentic-orchestration/)

### Node.js & IPC
- [Node.js Child Process Official Docs](https://nodejs.org/api/child_process.html)
- [IPC Performance in Node.js](https://60devs.com/performance-of-inter-process-communications-in-nodejs.html)
- [Inter Process Communication in Node.js](https://codeforgeek.com/inter-process-communication-in-nodejs/)

### Claude API
- [Going Async with Claude Agents](https://codesignal.com/learn/courses/parallelizing-claude-agentic-systems-in-python/lessons/concurrent-agent-conversations)
- [Running Multiple Claude Code Sessions in Parallel](https://dev.to/datadeer/part-2-running-multiple-claude-code-sessions-in-parallel-with-git-worktree-165i)
- [How to Run Multiple Claude Sessions in Parallel](https://jewelhuq.medium.com/how-to-run-multiple-claude-sessions-in-parallel-simple-step-by-step-01a32594bda2)

---

## ✅ Recommendation

**Start with: Option A - Supervisor Pattern (MVP)**

**Why:**
- Safest approach (master reviews all merges)
- Clear mental model for users
- Easy to debug and iterate
- Can evolve to peer-to-peer later

**Initial Scope:**
- 2-3 workers max
- Manual worktree creation (for testing)
- Master Claude coordinates via MCP tools
- UI shows worker status
- Manual merge approval

**Then Evolve:**
- Automate worktree creation
- Add peer-to-peer mode for advanced users
- Scale to 5+ workers
- Implement auto-merge for low-risk changes

---

**Next Steps:** Review this design, choose architecture, start Phase 1 implementation!
