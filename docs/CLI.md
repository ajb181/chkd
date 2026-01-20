# chkd CLI Reference

Complete reference for all chkd command-line commands.

---

## Quick Reference

```bash
# Status
chkd status              # See progress and current task
chkd progress            # See current task's sub-items
chkd workflow            # Show development workflow

# Building
chkd working "item"      # Signal you're working on an item
chkd tick "item"         # Mark an item complete

# Bugs
chkd bug "description"   # Quick-create a bug
chkd bugs                # List open bugs
chkd fix "bug"           # Mark a bug as fixed

# Setup
chkd init [name]         # Initialize new project
chkd upgrade [name]      # Add/update chkd in project

# Help
chkd help [command]      # Get help
```

---

## Status Commands

### `chkd status`

Show what's happening in your project.

```bash
chkd status
```

**Output:**
- Project name
- Overall progress (X/Y items complete)
- Current task being worked on
- Session iteration and duration

**When to use:**
- Start of day: "Where did I leave off?"
- After a break: "What was I working on?"
- Before committing: "What's the current state?"

---

### `chkd progress`

Show current task's sub-items and their status.

```bash
chkd progress
```

**Output example:**
```
🔨 Current Task: SD.3 User Authentication
─────────────────────────────────────
Progress: 2/4 sub-items

✅ Login form validation
✅ Password reset flow
🔨 Remember me functionality
⬚  Session timeout handling
```

**Status icons:**
- `⬚` Not started (`[ ]`)
- `🔨` In progress (`[~]`)
- `✅` Complete (`[x]`)

---

### `chkd workflow`

Show the 6-phase development workflow.

```bash
chkd workflow
```

**Phases:**
1. EXPLORE - Understand the problem
2. DESIGN - Flow diagrams, states
3. PROTOTYPE - Build with test data
4. FEEDBACK - Review working prototype
5. IMPLEMENT - Replace with real logic
6. POLISH - Loading states, errors

---

## Building Commands

### `chkd working "item"`

Signal you're starting work on an item.

```bash
chkd working "Login form validation"
chkd working "SD.1.2"
```

**What it does:**
- Updates session to show current item
- Marks item as `[~]` in-progress in SPEC.md
- Shows in `chkd status` output

**When to use:**
- Starting work on a sub-item
- Switching between items
- Resuming work after a break

---

### `chkd tick "item"`

Mark an item as complete in SPEC.md.

```bash
chkd tick                    # Tick current task
chkd tick "SD.1"             # Tick by task number
chkd tick "Login page"       # Tick by title
```

**The workflow:**
```bash
chkd working "item"   # 1. Signal start
# ... build it ...
chkd tick "item"      # 2. Mark done immediately
```

**Important:** Tick as you go! Don't batch at the end.

---

## Bug Commands

### `chkd bug "description"`

Quick-create a bug with minimal friction.

```bash
chkd bug "Save button broken"
chkd bug "Login fails on mobile" --severity high
chkd bug "Typo in footer" --severity low
```

**Options:**
- `--severity <level>` - critical, high, medium (default), low

**When to use:**
- Notice something broken while working
- User reports an issue
- Want to track something for later

---

### `chkd bugs`

List bugs at a glance.

```bash
chkd bugs              # Open bugs
chkd bugs --high       # High priority only
chkd bugs --all        # Include fixed bugs
```

**Output example:**
```
🐛 Open Bugs (3)
─────────────────
a1b2c3 [HIGH] Login fails on mobile
d4e5f6 [MED]  Save button broken
g7h8i9 [LOW]  Typo in footer
```

---

### `chkd fix "bug"`

Mark a bug as fixed.

```bash
chkd fix "Save button"      # By title
chkd fix "a1b2c3"           # By ID prefix
```

**What it does:**
- Marks bug as 'fixed' in database
- Sets resolved_at timestamp
- Prompts you to document learnings

**After fixing, consider:**
- What caused this bug? (root cause)
- How to prevent similar bugs?
- Should CLAUDE.md be updated?

---

## Setup Commands

### `chkd init [name]`

Initialize chkd in a NEW project.

```bash
chkd init                # Use folder name
chkd init "My App"       # Custom project name
```

**Requires:**
- Git repository (run `git init` first)
- No existing `docs/SPEC.md`

**Creates:**
- `docs/SPEC.md` - Feature checklist
- `docs/GUIDE.md` - How to use chkd
- `CLAUDE.md` - Instructions for Claude
- `.claude/skills/` - Build skills

---

### `chkd upgrade [name]`

Add chkd to an EXISTING project (or update to latest).

```bash
chkd upgrade             # Use folder name
chkd upgrade "My App"    # Custom project name
```

**What it does:**
1. Backs up existing files to `*-old`
2. Creates fresh chkd templates
3. Merges CLAUDE.md intelligently
4. Updates skills to latest versions
5. Preserves custom skills

**Safe to re-run** - only backs up on first run.

---

## Help

### `chkd help [command]`

Get help for commands.

```bash
chkd help              # List all commands
chkd help status       # Detailed help for status
chkd help tick         # Detailed help for tick
```

---

## Spec Markers

The SPEC.md file uses these markers:

| Marker | Meaning | Set by |
|--------|---------|--------|
| `[ ]` | Not started | Default |
| `[~]` | In progress | `chkd working` |
| `[x]` | Complete | `chkd tick` |

---

## The Sub-Item Workflow

For tasks with sub-items, **tick as you go**:

```bash
# For EACH sub-item:
chkd working "sub-item title"   # 1. Signal start
# ... build it ...
chkd tick "sub-item title"      # 2. Mark done immediately

# Then tick the parent:
chkd tick "SD.1"
```

**Why tick as you go?**
1. Progress is visible in real-time
2. User knows exactly where you are
3. If interrupted, work isn't lost
4. Spec stays accurate

---

## Skills (in Claude Code)

These are used inside Claude Code after running `claude`:

| Skill | Purpose |
|-------|---------|
| `/chkd SD.1` | Build task SD.1 from the spec |
| `/story` | Plan features, refine specs |
| `/bugfix` | Fix bugs with minimal changes |
| `/commit` | Safe commit workflow |
| `/reorder-spec` | Clean up messy SPEC.md |
| `/spec-check` | Validate SPEC.md format |
| `/retro` | Capture learnings, update docs |
