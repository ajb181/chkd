# chkd Product Knowledge

> Complete product understanding for documentation purposes.
> Source material for the World-Class User Guide (SD.22).

---

## What is chkd?

**chkd** (pronounced "checked") is a development workflow system that makes AI-assisted development structured and consistent.

**Core idea**: Plan in one place (UI/spec), build in another (terminal with Claude). The spec is the source of truth.

**Problem it solves**: When working with AI coding assistants, it's easy to:
- Lose track of what's been built
- Go off on tangents
- Forget the original plan
- Not see progress

**Solution**: chkd provides:
1. A spec file (`docs/SPEC.md`) as the single source of truth
2. A dashboard UI showing real-time progress
3. MCP tools that give Claude automatic context
4. Session tracking so nothing gets lost

---

## Core Concepts

### 1. The Spec File

`docs/SPEC.md` is the central document containing all planned features.

**Format:**
```markdown
## Area Name

- [ ] **CODE.1 Feature title** - Description
  - [ ] Sub-task 1
  - [ ] Sub-task 2
```

**Area codes:**
- `SD` - Site Design (UI, pages, flows)
- `FE` - Frontend (components, state, logic)
- `BE` - Backend (APIs, database, services)
- `FUT` - Future (planned but not yet started)

**Markers:**
- `[ ]` - Not started
- `[~]` - In progress
- `[x]` - Complete
- `[!]` - Blocked

### 2. Sessions

A session tracks what Claude is working on right now.

**Session types:**
- **Building**: Working on a spec task
- **Impromptu**: Ad-hoc work not in the spec
- **Debug**: Investigation/troubleshooting
- **Idle**: No active work

**Session includes:**
- Current task and sub-item
- Start time and duration
- Iteration count
- "Also did" list (side work)

### 3. Anchors

The anchor is the user's intended focus - what they asked Claude to work on.

**Purpose:**
- Prevents scope creep
- Enables "off-track" warnings
- Helps Claude stay focused

**Example:**
- User asks for SD.1
- Anchor is set to SD.1
- If Claude starts working on BE.3, system warns "off track"

### 4. The 6-Phase Workflow

Every feature follows this workflow:

1. **Explore** - Understand the problem, research existing patterns
2. **Design** - Plan approach, define contracts/interfaces
3. **Prototype** - Build with mock/test data (fast iteration)
4. **Feedback** - User reviews, approves before real implementation
5. **Implement** - Replace mock data with real logic
6. **Polish** - Error states, edge cases, loading states

**Why this order?**
- Get user feedback BEFORE investing in real implementation
- Catches design issues early
- Prototype can be thrown away if wrong
- Real implementation is clean because requirements are clear

### 5. Bugs and Quick Wins

**Bugs**: Issues that need fixing
- Have severity (critical, high, medium, low)
- Have status (open, in_progress, fixed, wont_fix)
- Workflow: bugfix → fix → resolve (with user verification)

**Quick Wins**: Small improvements (< 30 min)
- Stored in `docs/QUICKWINS.md`
- For ideas that don't need full spec items
- Can be completed anytime

---

## Architecture Overview

### Tech Stack

- **Framework**: SvelteKit
- **Database**: SQLite (local), PostgreSQL (SaaS)
- **MCP**: Model Context Protocol for Claude integration
- **CLI**: TypeScript via tsx

### Directory Structure

```
src/
├── cli/              # CLI tool (chkd command)
├── lib/
│   ├── api.ts        # Frontend API client
│   ├── components/   # Svelte components
│   └── server/       # Server-side code
│       ├── db/       # SQLite database
│       ├── spec/     # Spec parser & writer
│       ├── ideas/    # External idea submissions
│       └── git/      # Git worktree utilities
├── mcp/              # MCP server
└── routes/
    ├── +page.svelte  # Main dashboard
    ├── guide/        # Guide page
    ├── settings/     # Settings pages
    └── api/          # API endpoints
```

### Key Files

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | CLI commands |
| `src/mcp/server-http.ts` | MCP tools (60+ tools) |
| `src/lib/server/spec/parser.ts` | Parses SPEC.md |
| `src/lib/server/spec/writer.ts` | Modifies SPEC.md |
| `src/routes/+page.svelte` | Main UI |
| `docs/SPEC.md` | The task list |

---

## Feature Inventory

### Core Features (Implemented)

**Session Management**
- Start/stop work sessions
- Track current task
- Iteration counting
- "Also did" tracking
- Anchor system for focus

**Spec Management**
- Parse SPEC.md with full fidelity
- Add/edit/tick items
- Progress tracking
- Area organization
- AI-powered spec repair

**Bug Tracking**
- Quick bug creation
- Severity levels
- Fix workflow with user verification
- Bug list and filtering

**Quick Wins**
- Lightweight task tracking
- Markdown-based storage
- Toggle completion

**Settings**
- Repo management
- API key configuration
- LLM tone customization
- Custom instructions

### Advanced Features (Implemented)

**Multi-Worker System**
- Spawn parallel Claude workers
- Git worktree isolation
- Manager/worker communication
- Conflict detection and resolution
- Automatic merge when safe
- Worker heartbeat and status

**Manager Tools (Tech Lead Role)**
- Research codebase before assigning work
- Create structured stories from requests
- Review worker output before merge
- Document changes after completion

**External Ideas Submission**
- Accept feature ideas from non-developers
- Ideas queue with review workflow
- Approve to promote to spec
- Reject with feedback

**MCP Integration**
- 60+ MCP tools for Claude
- Resources (chkd://conscience, chkd://spec)
- Automatic context injection
- Stale server detection

### SaaS Features (Planned)

**Multi-Tenancy**
- Team workspaces
- Role-based permissions (admin, developer, viewer)
- PostgreSQL backend

**GitHub/GitLab Integration**
- GitHub App for repo access
- Webhook handlers
- PR automation

**Managed Workers**
- Cloud-hosted Claude workers
- Fly.io infrastructure
- Usage-based billing

**Analytics**
- Velocity tracking
- Time per task
- Team activity
- Bug metrics

---

## User Personas

### 1. New User (0-30 minutes)
**Goal**: Get chkd running, understand the concept

**Needs:**
- Clear installation steps
- Quick start guide (5 min)
- "Hello World" equivalent
- Core concept explanation

**Questions:**
- "What is this?"
- "How do I install it?"
- "How do I get started?"

### 2. Active User (Daily workflow)
**Goal**: Productive daily development

**Needs:**
- CLI command reference
- UI feature guide
- Workflow tips
- Customization options

**Questions:**
- "How do I add a feature?"
- "How do I track bugs?"
- "How do I customize the AI?"

### 3. Power User (Advanced features)
**Goal**: Maximum productivity with advanced features

**Needs:**
- Multi-worker documentation
- MCP tools deep dive
- Custom skills guide
- Integration patterns

**Questions:**
- "How do I run parallel workers?"
- "What MCP tools are available?"
- "How do I create custom skills?"

### 4. Team Lead (SaaS/Enterprise)
**Goal**: Team deployment and management

**Needs:**
- SaaS setup guide
- Team configuration
- Permissions documentation
- Analytics explanation

**Questions:**
- "How do I set up for my team?"
- "How do I manage permissions?"
- "How do I track team velocity?"

---

## CLI Commands Summary

### Session Commands
```bash
chkd status              # See current state
chkd working "item"      # Start working on item
chkd tick "item"         # Mark complete
chkd impromptu "desc"    # Start ad-hoc work
chkd debug "desc"        # Start investigation
chkd done                # End session
```

### Spec Commands
```bash
chkd list                # List all items
chkd add "title"         # Add feature
chkd edit "ID" --story   # Update item
chkd repair              # AI reformat spec
```

### Bug Commands
```bash
chkd bug "desc"          # Create bug
chkd bugs                # List bugs
chkd bugfix "bug"        # Start fixing
chkd fix "bug"           # Signal ready
chkd resolve "bug"       # Close after verified
```

### Quick Win Commands
```bash
chkd win "title"         # Add quick win
chkd wins                # List quick wins
chkd won "query"         # Mark done
```

---

## MCP Tools Summary

### Core Tools
- `chkd_status` - Get current state
- `chkd_working` - Signal starting work
- `chkd_tick` - Mark complete
- `chkd_suggest` - Get suggestions

### Session Tools
- `chkd_impromptu` - Start ad-hoc session
- `chkd_debug` - Start debug session
- `chkd_done` - End session
- `chkd_pulse` - Status update
- `chkd_checkin` - 15-min check-in

### Bug Tools
- `chkd_bug` - Create bug
- `chkd_bugs` - List bugs
- `chkd_bugfix` - Start bugfix
- `chkd_fix` - Signal ready
- `chkd_resolve` - Close bug

### Multi-Worker Tools
- `chkd_spawn_worker` - Create parallel worker
- `chkd_workers` - List workers
- `chkd_pause_worker` / `chkd_resume_worker`
- `chkd_merge_worker` - Merge worker changes
- `chkd_stop_worker` - Stop worker

### Manager Tools
- `chkd_research_codebase` - Explore codebase
- `chkd_research_patterns` - Find patterns
- `chkd_story_create` - Create structured story
- `chkd_story_breakdown` - Break into tasks
- `chkd_review_diff` - Review worker changes
- `chkd_review_approve` - Approve for merge

---

## Common Workflows

### Starting a New Feature
```
1. Add feature: chkd add "User auth" --area BE
2. Start work: /chkd BE.1
3. Follow 6-phase workflow
4. Tick sub-items as completed
5. Commit when done: /commit
```

### Fixing a Bug
```
1. Log bug: chkd bug "Login fails"
2. Start fix: chkd bugfix "Login"
3. Align with user on scope
4. Research root cause
5. Propose fix
6. Implement minimal change
7. Signal ready: chkd fix "Login"
8. User verifies
9. Close: chkd resolve "Login"
```

### Running Parallel Workers
```
1. Master: chkd_spawn_worker("SD.3", "Dashboard")
2. Open new terminal, cd to worktree
3. Start Claude: claude
4. Worker implements task
5. Worker signals complete
6. Master reviews and merges
7. Conflict resolution if needed
```

---

## Troubleshooting Quick Reference

| Problem | Solution |
|---------|----------|
| "chkd: command not found" | `cd ~/chkd && sudo npm link` |
| "Cannot connect to chkd" | `cd ~/chkd && npm run dev` |
| MCP tools not showing | Check Claude MCP config, restart |
| "Task not found" | Check SPEC.md format |
| Spec format broken | `chkd repair` |
| Session stuck | `chkd done` then restart |

---

## Version History

- **v2.0** - Current release
  - HTTP-based MCP server
  - Multi-worker system
  - Manager tools
  - External ideas

- **v1.0** - Initial release
  - Basic spec tracking
  - CLI commands
  - Session management

---

## Glossary

| Term | Definition |
|------|------------|
| **Spec** | The SPEC.md file containing all planned features |
| **Anchor** | User's intended focus (prevents scope creep) |
| **Session** | Active work tracking (task, time, progress) |
| **Worker** | Parallel Claude instance in git worktree |
| **Manager** | Master Claude coordinating workers |
| **Quick Win** | Small improvement (< 30 min) |
| **MCP** | Model Context Protocol (Claude integration) |
| **Worktree** | Git feature for parallel branches |
