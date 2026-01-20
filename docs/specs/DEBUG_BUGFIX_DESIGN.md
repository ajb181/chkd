# Debug/Bugfix Feature Design

Comprehensive design for the debug and bugfix workflow in chkd.

---

## Overview

The debug/bugfix system helps developers fix bugs methodically without feature creep. It integrates:
- A Claude skill (`/bugfix`) for guided debugging
- CLI commands for quick status checks
- API endpoints for session tracking
- UI for viewing debug state
- Local file (`.debug-notes.md`) for findings

### Core Philosophy

1. **Research before coding** - Web search first, brute force last
2. **Minimal changes** - Fix the bug, nothing more
3. **Verify with user** - They confirm it's fixed
4. **Capture ideas** - Don't act on them during bugfix

---

## 1. Claude Skill: `/bugfix`

**File**: `.claude/skills/bugfix/SKILL.md`

### Entry Point

When user invokes `/bugfix`, Claude:

1. Runs `chkd status` to see current state
2. Creates/appends to `.debug-notes.md`
3. Asks user to describe the bug
4. Enters DEBUG MODE

### Debug Mode Workflow

```
UNDERSTAND → RESEARCH → REPRODUCE → ISOLATE → FIX → VERIFY
```

| Phase | Actions |
|-------|---------|
| UNDERSTAND | Ask questions, read error messages |
| RESEARCH | Web search for similar issues |
| REPRODUCE | Confirm bug can be triggered |
| ISOLATE | Find root cause |
| FIX | Minimal change only |
| VERIFY | User confirms fix works |

### Exit Conditions

Claude stays in debug mode until:
- [ ] User confirmed bug is fixed
- [ ] `.debug-notes.md` updated with findings
- [ ] No unrelated changes made
- [ ] Ideas noted for later (not acted on)

### Scope Creep Handling

When Claude notices other issues:
```
"I noticed X could be improved. That's not the bug we're fixing,
so I'm noting it in .debug-notes.md for later."
```

When user asks for features:
```
"That's a feature request, not a bug fix. I've noted it.
Let's finish the bug fix first."
```

### Debug Notes File

**File**: `.debug-notes.md` (project root, gitignored recommended)

```markdown
## Debug Session: 2026-01-20 14:30
**Bug:** Save button doesn't work

### Symptoms
- Button shows spinner forever
- Console: TypeError: Cannot read property 'id' of undefined

### Research
- Found similar issue: [link]
- Cause: accessing data before loaded

### Root Cause
- Line 87: `user.id` called when `user` is null
- Happens before session loads

### Fix Applied
- Added guard: `if (!user) return;`
- File: src/lib/components/SaveButton.svelte:87

### Verified
- [x] User confirmed fix works
- [x] No regression in related features

### Ideas for Later
- Add loading indicator to save button
- Improve error messages for null user
```

---

## 2. CLI Commands

**File**: `src/cli/index.ts`

### Existing Commands (update help text)

| Command | Description |
|---------|-------------|
| `chkd status` | Show progress, current task, debug state |
| `chkd workflow` | Show development workflow |
| `chkd help [cmd]` | Detailed help for commands |
| `chkd init` | Initialize new project |
| `chkd upgrade` | Add chkd to existing project |

### NEW: Quick Bug Commands (PRIORITY)

| Command | Description |
|---------|-------------|
| `chkd bug "description"` | Quick-create a bug |
| `chkd bugs` | List all open bugs |

**Quick Create** - One command, minimal friction:
```bash
$ chkd bug "Save button broken"
  ✓ Bug created: Save button broken

$ chkd bug "Login fails on mobile" --severity high
  ✓ Bug created [HIGH]: Login fails on mobile
```

**Quick List** - See bugs at a glance:
```bash
$ chkd bugs

  🐛 Open Bugs (3)
  ─────────────────
  #1 [HIGH] Login fails on mobile
  #2 [MED]  Save button broken
  #3 [LOW]  Typo in footer

  Use: chkd bug "description" to add more
```

**With filters:**
```bash
$ chkd bugs --high        # Only high/critical
$ chkd bugs --all         # Include fixed bugs
```

### Help Text Updates

Each command should have detailed help via `chkd help <command>`:

```
chkd help status
─────────────────
Show what's happening in your project:
- Overall progress (X/Y items complete)
- Current task being worked on
- Debug mode indicator (if active)
- Session duration

Use this to orient yourself. Run it often.

Examples:
  chkd status          # Basic status
```

```
chkd help workflow
─────────────────
Shows the 6-phase development workflow:
  EXPLORE → DESIGN → PROTOTYPE → FEEDBACK → IMPLEMENT → POLISH

Each feature follows this flow. It catches issues early.

For bugfixes, use /bugfix in Claude Code instead.
```

```
chkd help init
─────────────────
Initialize chkd in a new project.

Creates:
  docs/SPEC.md      - Feature specification
  docs/GUIDE.md     - How to use chkd
  CLAUDE.md         - Instructions for Claude
  .claude/skills/   - Build skills (/chkd, /bugfix, etc.)

Usage:
  chkd init              # Use directory name
  chkd init "My App"     # Custom project name

Requires: Git repository (run 'git init' first)
```

```
chkd help upgrade
─────────────────
Add chkd to an existing project.

What it does:
  1. Backs up existing files to *-old
  2. Creates fresh chkd templates
  3. Merges CLAUDE.md intelligently (if substantial)
  4. Updates skills to latest versions

Safe to re-run - preserves original backups.

Usage:
  chkd upgrade           # Use directory name
  chkd upgrade "My App"  # Custom project name
```

### Status Output Enhancement

```
$ chkd status

  📁 my-project
  ─────────────────────────
  Progress: [████████████░░░░░░░░] 60%
  Items: 12/20 complete

  🔨 Current task:
     SD.3 User Authentication
     Iteration 2 • 45m

  🐛 Debug mode: ACTIVE
     Bug: Save button not working
     Duration: 12m

  Next: Continue debugging or run /bugfix
```

---

## 3. API Endpoints

**Base**: `http://localhost:3847`

### Session Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/session/start` | POST | Start a session (building or debugging) |
| `/api/session/check` | POST | Validate request against spec |
| `/api/session/working-on` | POST | Set current task |
| `/api/session/also-did` | POST | Log off-plan work |
| `/api/session/complete` | POST | End session |

### Debug-Specific Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/session/debug/start` | POST | Start debug session |
| `/api/session/debug/notes` | GET | Read .debug-notes.md |
| `/api/session/debug/notes` | POST | Append to .debug-notes.md |
| `/api/session/debug/complete` | POST | End debug session |

### Bug Tracking Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bugs` | GET | List bugs for repo |
| `/api/bugs` | POST | Create new bug |
| `/api/bugs/:id` | PATCH | Update bug status |
| `/api/bugs/:id` | DELETE | Remove bug |

### Request/Response Examples

**Start Debug Session**
```bash
POST /api/session/debug/start
{
  "repoPath": "/path/to/project",
  "bugDescription": "Save button doesn't work"
}

Response:
{
  "success": true,
  "session": {
    "id": 1,
    "mode": "debugging",
    "bugDescription": "Save button doesn't work",
    "startedAt": "2026-01-20T14:30:00Z"
  }
}
```

**Append Debug Notes**
```bash
POST /api/session/debug/notes
{
  "repoPath": "/path/to/project",
  "section": "findings",
  "content": "Root cause: user.id accessed before session loads"
}

Response:
{
  "success": true,
  "notesPath": "/path/to/project/.debug-notes.md"
}
```

**Complete Debug Session**
```bash
POST /api/session/debug/complete
{
  "repoPath": "/path/to/project",
  "fixed": true,
  "summary": "Added null check for user object"
}

Response:
{
  "success": true,
  "duration": "15m",
  "notesPath": "/path/to/project/.debug-notes.md"
}
```

---

## 4. Database Schema

**File**: `src/lib/server/db/index.ts`

### Sessions Table (existing, extend)

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL,

  -- Current work
  current_task TEXT,
  current_item TEXT,
  status TEXT DEFAULT 'idle',
  mode TEXT DEFAULT 'building',  -- 'building' | 'debugging' | 'testing'

  -- Debug-specific
  bug_description TEXT,
  debug_started_at TEXT,

  -- Tracking
  iteration INTEGER DEFAULT 1,
  started_at TEXT,
  elapsed_ms INTEGER DEFAULT 0,

  -- JSON arrays
  bug_fixes TEXT DEFAULT '[]',
  scope_changes TEXT DEFAULT '[]',
  deviations TEXT DEFAULT '[]',
  files_changed TEXT DEFAULT '[]',
  also_did TEXT DEFAULT '[]',

  FOREIGN KEY (repo_id) REFERENCES repos(id)
);
```

### Bugs Table (existing)

```sql
CREATE TABLE bugs (
  id INTEGER PRIMARY KEY,
  repo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'medium',  -- 'critical' | 'high' | 'medium' | 'low'
  type TEXT DEFAULT 'bug',         -- 'bug' | 'hotfix'
  status TEXT DEFAULT 'open',      -- 'open' | 'in_progress' | 'fixed' | 'wont_fix'
  affected_phase TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,

  FOREIGN KEY (repo_id) REFERENCES repos(id)
);
```

---

## 5. UI Components

**Location**: `src/routes/` and `src/lib/components/`

### Main Page Enhancement

**File**: `src/routes/+page.svelte`

Add debug mode indicator to status bar:

```svelte
{#if session?.mode === 'debugging'}
  <div class="debug-banner">
    <span class="debug-icon">🐛</span>
    <span class="debug-text">Debug Mode</span>
    <span class="debug-bug">{session.bugDescription}</span>
    <span class="debug-duration">{formatDuration(session.debugStartedAt)}</span>
  </div>
{/if}
```

### Debug Notes Viewer (optional)

If we want to show `.debug-notes.md` in UI:

```svelte
<script>
  let debugNotes = '';

  async function loadDebugNotes() {
    const res = await fetch(`/api/session/debug/notes?repoPath=${repoPath}`);
    const data = await res.json();
    debugNotes = data.content || '';
  }
</script>

{#if debugNotes}
  <div class="debug-notes">
    <h3>Debug Notes</h3>
    <pre>{debugNotes}</pre>
  </div>
{/if}
```

---

## 6. File Structure

```
project/
├── .debug-notes.md          # Debug session notes (local, gitignored)
├── CLAUDE.md                # Project instructions
├── docs/
│   ├── SPEC.md              # Feature spec
│   └── GUIDE.md             # User guide
└── .claude/
    └── skills/
        └── bugfix/
            └── SKILL.md     # Bugfix skill
```

### .gitignore Addition

```gitignore
# Debug notes (local developer notes)
.debug-notes.md
```

---

## 7. User Documentation

### GUIDE.md Section

Add to `docs/GUIDE.md`:

```markdown
## Fixing Bugs

Use `/bugfix` in Claude Code for guided debugging.

### The Process

1. **Describe the bug** - What's broken? What did you expect?
2. **Research first** - Claude searches for similar issues
3. **Reproduce** - Confirm the bug can be triggered
4. **Isolate** - Find the root cause
5. **Fix minimally** - Change only what's needed
6. **Verify** - You confirm it works

### Debug Notes

Findings are saved to `.debug-notes.md` in your project. This file:
- Tracks your investigation
- Documents the root cause
- Records what was fixed
- Notes ideas for later (without acting on them)

### Avoiding Scope Creep

During bugfix mode, Claude will:
- NOT add new features
- NOT refactor "while you're there"
- NOT clean up unrelated code
- ONLY fix the reported bug

If you notice other issues, Claude captures them for later.

### Example Session

```
You: /bugfix
Claude: What bug are you seeing?

You: The save button doesn't work, shows spinner forever
Claude: Let me understand:
- Is there an error in the console?
- Did this work before?
- Can you reproduce it consistently?

You: Console shows TypeError, it worked yesterday
Claude: [searches for similar issues]
Found similar pattern. Usually means accessing data before loaded.
Let me check the save handler...

[reads code]

Found it. Line 87 calls user.id but user can be null.
I'll add a guard check. Sound right?

You: Yes
Claude: [makes minimal edit]
Done. Can you test it now?

You: Works! But could you also add a loading indicator?
Claude: That's a feature, not a bug fix. I've noted it in
.debug-notes.md for later. The bug is fixed.
```
```

### CLAUDE.md Section

Add to project `CLAUDE.md`:

```markdown
## Debugging

For bugs, use `/bugfix` skill. It enforces:
- Research before coding
- Minimal changes only
- User verification
- No scope creep

Debug notes go to `.debug-notes.md` (gitignored).
```

---

## 8. Implementation Checklist

### Phase 1: Skill Update (do first)
- [x] Update `.claude/skills/bugfix/SKILL.md` - remove curl, use CLI
- [x] Update `templates/skills/bugfix/SKILL.md` - same changes
- [x] Test skill works end-to-end

### Phase 2: CLI Enhancement (PRIORITY)
- [x] Add `chkd bug "desc"` - quick bug creation
- [x] Add `chkd bugs` - quick bug listing
- [x] Add comprehensive help for all commands
- [ ] Enhance `chkd status` to show debug mode
- [x] Test all help commands

### Phase 3: Documentation
- [x] Add debugging section to `docs/GUIDE.md`
- [x] Update `CLAUDE.md` with debug info
- [ ] Add `.debug-notes.md` to `.gitignore` template

### Phase 4: API (optional, future)
- [ ] Add `/api/session/debug/start` endpoint
- [ ] Add `/api/session/debug/notes` endpoint
- [ ] Add `/api/session/debug/complete` endpoint

### Phase 5: UI (optional, future)
- [ ] Add debug mode banner to main page
- [ ] Add debug notes viewer (if wanted)

---

## 9. Design Decisions

### Why `.debug-notes.md` is Local

- **Simplicity**: No API needed, Claude writes directly
- **Privacy**: Debug notes may contain sensitive info
- **Flexibility**: Developer can edit manually
- **Portability**: Works without server running

### Why No Separate `/debug` Skill

- `/bugfix` already covers debugging workflow
- One skill is easier to maintain
- Avoids confusion about when to use which

### Why Minimal API

- Skill-based approach works well
- Less infrastructure to maintain
- Claude can read/write files directly
- API only needed for UI integration

### Why Research-First

- Someone probably hit the bug before
- Brute force wastes time
- Non-obvious fixes are common
- Prevents introducing new bugs

---

## 10. Migration Path

### From Current State

1. Update skill files (remove curl, non-existent commands)
2. Add CLI help text
3. Update documentation
4. Test workflow end-to-end

### No Breaking Changes

- Skill continues to work
- No new dependencies
- No database migrations needed
- Backward compatible

---

## Summary

The debug/bugfix feature is primarily **skill-driven** with optional API/UI support. The core workflow:

1. User runs `/bugfix`
2. Claude asks about the bug
3. Claude researches, then fixes minimally
4. Claude updates `.debug-notes.md`
5. User verifies fix
6. Session ends

This design keeps it simple while providing a structured debugging process.
