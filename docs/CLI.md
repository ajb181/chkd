# chkd CLI Reference

Complete reference for all chkd command-line commands.

---

## Quick Reference

```bash
# Status
chkd status              # See progress and current task
chkd list                # List all spec items by area
chkd progress            # See current task's sub-items
chkd workflow            # Show development workflow

# Building
chkd working "item"      # Signal you're working on an item
chkd tick "item"         # Mark an item complete
chkd iterate             # Increment iteration, get reminder

# Bugs
chkd bug "description"   # Quick-create a bug
chkd bugs                # List open bugs
chkd fix "bug"           # Mark a bug as fixed

# Spec
chkd repair              # AI-powered SPEC.md reformatting

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

### `chkd list`

List all spec items organized by area.

```bash
chkd list
```

**Output:**
- Project title and overall progress
- All areas with item counts
- Each item with status icon and ID
- Bugs section at the end (if any)

**Status icons:**
- `○` Not started
- `◐` In progress
- `✓` Complete
- `–` Skipped

**Output example:**
```
📋 My Project
─────────────────────────────────────────
Progress: 13/20 (65%)

Site Design (3/5)
  ✓ SD.1   Landing page
  ✓ SD.2   Navigation
  ◐ SD.3   Dashboard
  ○ SD.4   Settings
  – SD.5   Admin panel

🐛 Bugs (2 open, 1 fixed)
  ○ 🟠 a1b2c3  Login crash
  ✓ 🟡 d4e5f6  Save button
```

**When to use:**
- See all tasks at a glance
- Find a task ID to work on
- Review what's left to do

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

### `chkd iterate`

Increment iteration counter and get a context reminder.

```bash
chkd iterate             # Increment and show context
chkd cycle               # Alias for iterate
```

**What it does:**
- Increments iteration count for current session
- Shows current phase and working item
- Provides phase-specific guidance
- Reminds you to stay focused

**Output example:**
```
🔄 Iteration #3 on SD.1
   Phase: Feedback
   Working on: User reviews login UX
─────────────────────────────────
💡 Get explicit approval. One approval ≠ blanket approval.
📋 Still in Feedback? Easy to get sidetracked here.
```

**When to use:**
- After completing a discrete piece of work
- During extended back-and-forth (especially Feedback phase)
- Whenever you need a context anchor

**Why it matters:**
During long feedback discussions, it's easy to lose focus on the process. Running `chkd iterate` keeps you anchored to where you are and what you should be doing.

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

## Spec Commands

### `chkd repair`

Reformat SPEC.md using AI to fix formatting issues.

```bash
chkd repair
```

**What it does:**
1. Reads your `docs/SPEC.md`
2. Uses AI to reformat to correct chkd format
3. Creates backup at `docs/SPEC-backup.md`
4. Writes reformatted content
5. Validates the result

**Requires:**
- API key: `CHKD_API_KEY` or `ANTHROPIC_API_KEY` env var
- Existing `docs/SPEC.md` file

**What it fixes:**
- Item format: `- [ ] **SD.1 Title** - Description`
- Area headers: `## Area: SD (Site Design)`
- Sequential numbering within areas
- Sub-item indentation
- Missing separators between areas

**What it preserves:**
- All existing items (never removes content)
- Completion status: `[ ]`, `[x]`, `[~]`
- Item descriptions and meaning
- Custom area codes if used

**When to use:**
- After manually editing SPEC.md
- When items are formatted incorrectly
- When area headers don't match expected format
- After dumping quick notes into the spec

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

## Phase Keywords

When sub-items start with these keywords, they have special meaning in chkd. The CLI provides contextual guidance for each phase.

| Keyword | Meaning | CLI Nudge |
|---------|---------|-----------|
| **Explore:** | Research before building | "If complex, ask the user questions" |
| **Design:** | Plan the approach | "Diagram if complex" |
| **Prototype:** | Build with fake data | "Real backend comes later" |
| **Feedback:** | User review checkpoint | "Stop. Document their feedback in the story" |
| **Implement:** | Build real logic | "Feedback was approved" |
| **Polish:** | Refinement | "Error states, edge cases, loading" |

These keywords are automatically added when creating features with `chkd add`. They enforce the workflow philosophy: **get user feedback before investing in real implementation**.

Example sub-items:
```markdown
- [ ] Explore: check existing auth patterns
- [ ] Design: auth flow + endpoint contract
- [ ] Prototype: login UI with mock data
- [ ] Feedback: user reviews login UX
- [ ] Implement: real auth + session handling
- [ ] Polish: error states, remember me
```

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
