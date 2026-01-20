# chkd Development Guide

> Keep Claude on-plan. Track what gets built.

---

## What is chkd?

chkd helps you build software with Claude Code without losing control. It:

1. **Holds your spec** - A checklist of features in `docs/SPEC.md`
2. **Tracks progress** - See what's done, what's in progress
3. **Keeps Claude focused** - Claude builds what you planned, not random stuff
4. **Logs surprises** - If Claude does something unplanned, it's tracked as "Also did"

**The core idea:** You plan in the chkd UI, Claude builds in the terminal.

---

## Prerequisites

Before you start, you need:

- **Node.js** (v18 or later) - [nodejs.org](https://nodejs.org)
- **Git** - Your project must be a git repository
- **Claude Code** - The Claude CLI tool (`claude` command)

---

## Quick Start (First Time Setup)

### Step 1: Install chkd

```bash
# Go to where chkd lives
cd ~/chkd-v2

# Install dependencies
npm install

# Make 'chkd' command available everywhere
sudo npm link
# (enter your password when asked)

# Verify it worked
chkd help
```

If you see a list of commands, you're good!

### Step 2: Start the chkd server

```bash
# In the chkd-v2 folder
npm run dev
```

Keep this terminal open. The server runs at `http://localhost:3847`

### Step 3: Add your project to chkd

Open a **new terminal** and go to your project:

```bash
# Go to your project
cd ~/my-project

# If it's not a git repo yet:
git init

# Add chkd to your project
chkd upgrade
```

This creates:
- `docs/SPEC.md` - Where you list your features
- `docs/GUIDE.md` - This guide
- `CLAUDE.md` - Instructions for Claude
- `.claude/skills/` - Build commands

### Step 4: Add features to your spec

Edit `docs/SPEC.md` to list what you want to build:

```markdown
# My Project

## Area: FE (Frontend)

- [ ] **1.1 Login page** - Email/password form with validation
- [ ] **1.2 Dashboard** - Show user stats and recent activity
- [ ] **1.3 Settings page** - Let users update their profile

## Area: BE (Backend)

- [ ] **2.1 Auth API** - Login, logout, session management
- [ ] **2.2 User API** - CRUD operations for users
```

**Important:** The numbers like `1.1`, `1.2` are **task IDs**. You'll use these to tell Claude what to build.

### Step 5: Build something!

1. Open the chkd UI: `http://localhost:3847`
2. Select your project from the dropdown
3. Find a task you want to build (e.g., "1.1 Login page")
4. Note the task ID (the number, like `1.1`)
5. In your project terminal, start Claude Code:
   ```bash
   claude
   ```
6. Tell Claude what to build:
   ```
   /chkd SD.1
   ```

Claude will read your spec and build task 1.1.

---

## Daily Workflow

Once chkd is set up, here's your daily routine:

```
1. Start chkd server     →  npm run dev (in chkd-v2 folder)
2. Open UI               →  http://localhost:3847
3. Pick a task           →  Note the ID (e.g., "2.3")
4. Start Claude Code     →  claude (in your project folder)
5. Build the task        →  /chkd 2.3
6. When done             →  /commit
7. Repeat                →  Pick next task
```

---

## Understanding Task IDs

Task IDs come from your `docs/SPEC.md` file. They follow this pattern:

```
Area.ItemNumber
```

Examples:
- `1.1` = First area, first item
- `2.3` = Second area, third item
- `3.1` = Third area, first item

In your spec, they look like this:

```markdown
## Area: FE (Frontend)        ← This is area 1

- [ ] **1.1 Login page**      ← Task ID is 1.1
- [ ] **1.2 Dashboard**       ← Task ID is 1.2

## Area: BE (Backend)         ← This is area 2

- [ ] **2.1 Auth API**        ← Task ID is 2.1
```

When you run `/chkd SD.1`, Claude looks up task 1.1 in your spec and builds it.

---

## Available Commands

### In your regular terminal:

| Command | What it does |
|---------|--------------|
| `chkd status` | Show progress and current task |
| `chkd bug "desc"` | Quick-create a bug |
| `chkd bugs` | List open bugs |
| `chkd upgrade` | Add/update chkd in your project |
| `chkd init` | Set up chkd in a brand new project |
| `chkd workflow` | Show the development workflow |
| `chkd help` | Show all commands |

### In Claude Code (after running `claude`):

| Command | What it does |
|---------|--------------|
| `/chkd SD.1` | Build task SD.1 from your spec |
| `/story` | Plan features, refine your spec |
| `/bugfix` | Fix a bug with minimal changes |
| `/commit` | Commit your changes safely |
| `/reorder-spec` | Clean up and organize SPEC.md |
| `/spec-check` | Validate SPEC.md format |

---

## What Happens When You Run /chkd

When you run `/chkd SD.1`:

1. **Claude reads your spec** - Finds task SD.1 and understands what to build
2. **Claude implements it** - Writes the code, creates files, etc.
3. **If Claude does extra stuff** - It logs it as "Also did" (visible in the UI)
4. **When done** - Claude tells you it's ready

### Sub-Item Workflow

For tasks with sub-items, Claude should tick as it goes:

```bash
# For EACH sub-item:
chkd working "sub-item title"   # Signal start
# ... build it ...
chkd tick "sub-item title"      # Mark done immediately
```

This keeps progress visible in real-time. If interrupted, work isn't lost.

### Spec Markers

Your SPEC.md uses these markers:
- `[ ]` - Not started
- `[~]` - In progress
- `[x]` - Complete

### "Also Did" Tracking

Sometimes while building task 1.1, Claude might fix a typo it noticed or adjust some styling. This is tracked:

```
Also did:
+ Fixed typo in header component
+ Updated error message styling
```

This shows up in the chkd UI so you know what happened. You're not blocked - it's just tracked.

---

## Common Situations

| You want to... | Do this |
|----------------|---------|
| Build a specific task | `/chkd SD.1` (use the task ID) |
| Plan or refine features | `/story` |
| Fix a bug | `/bugfix` |
| Quick-log a bug | `chkd bug "description"` |
| See open bugs | `chkd bugs` |
| Commit your work | `/commit` |
| See overall progress | `chkd status` (in regular terminal) |
| Check the UI | Open `http://localhost:3847` |

---

## Fixing Bugs

Use `/bugfix` in Claude Code for guided debugging.

### Quick Bug Tracking

```bash
# Quick-add a bug you noticed
chkd bug "Save button doesn't work"

# Add with severity
chkd bug "Login crash on mobile" --severity high

# See all open bugs
chkd bugs
```

### The Bugfix Process

When you run `/bugfix` in Claude Code:

1. **Describe the bug** - What's broken? What did you expect?
2. **Research first** - Claude searches for similar issues
3. **Reproduce** - Confirm the bug can be triggered
4. **Isolate** - Find the root cause
5. **Fix minimally** - Change only what's needed
6. **Verify** - You confirm it works

### Debug Notes

Findings are saved to `.debug-notes.md` in your project:

```markdown
## Debug Session: 2026-01-20 14:30
**Bug:** Save button doesn't work

### Symptoms
- Button shows spinner forever
- Console: TypeError: Cannot read property 'id' of undefined

### Root Cause
- Line 87: user.id called when user is null

### Fix Applied
- Added guard: if (!user) return;

### Verified
- [x] User confirmed fix works
```

### Avoiding Scope Creep

During bugfix mode, Claude will:
- **NOT** add new features
- **NOT** refactor "while you're there"
- **NOT** clean up unrelated code
- **ONLY** fix the reported bug

If Claude notices other issues, it captures them with `chkd bug "..."` for later.

---

## Troubleshooting

### "chkd: command not found"

You need to run `sudo npm link` in the chkd-v2 folder:

```bash
cd ~/chkd-v2
sudo npm link
```

### "Cannot connect to chkd"

The chkd server isn't running. Start it:

```bash
cd ~/chkd-v2
npm run dev
```

### "Task 1.1 not found"

The task doesn't exist in your spec. Check `docs/SPEC.md` and make sure:
- The task is listed with the right ID
- The format is `- [ ] **1.1 Task name**`

### "Claude keeps asking what to work on"

Give it a task ID: `/chkd SD.1`

### "Claude is doing something I didn't ask for"

Type "stop" to interrupt. Then check if you gave the right task ID.

### "Permission denied" when running npm link

Use `sudo`:

```bash
sudo npm link
```

---

## Updating chkd

When chkd gets updated:

```bash
cd ~/chkd-v2
git pull
npm install
```

That's it! The `npm link` from before still works.

To update skills in your projects:

```bash
cd ~/my-project
chkd upgrade
```

This copies the latest skills without touching your spec or custom files.

---

## Files chkd Creates

| File | What it's for |
|------|---------------|
| `docs/SPEC.md` | Your feature checklist (source of truth) |
| `docs/GUIDE.md` | This guide |
| `CLAUDE.md` | Project instructions for Claude |
| `.claude/skills/` | Skill definitions (chkd, story, bugfix, etc.) |

---

## Tips for Writing Good Specs

### Do this:

```markdown
- [ ] **1.1 Login page** - Email/password form with validation, error messages, remember me checkbox
```

### Not this:

```markdown
- [ ] Login
```

**Be specific.** The more detail in your spec, the better Claude understands what to build.

### Use sub-tasks for complex features:

```markdown
- [ ] **1.1 User authentication**
  - [ ] Login form with validation
  - [ ] Password reset flow
  - [ ] Remember me functionality
  - [ ] Session timeout handling
```

---

## The Big Picture

```
┌─────────────────────────────────────────────────────┐
│                     YOU                              │
│                                                      │
│  1. Write features in docs/SPEC.md                  │
│  2. Pick a task ID from the UI                      │
│  3. Run /chkd <task_id> in Claude Code              │
│  4. Review what Claude built                        │
│  5. Run /commit when happy                          │
│  6. Repeat                                          │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                   CLAUDE                             │
│                                                      │
│  1. Reads your spec                                 │
│  2. Builds what you asked for                       │
│  3. Logs any extra work as "Also did"              │
│  4. Tells you when done                            │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                   chkd UI                            │
│                                                      │
│  - Shows progress                                   │
│  - Shows current task                               │
│  - Shows "Also did" list                           │
│  - Helps you pick what's next                      │
└─────────────────────────────────────────────────────┘
```

---

## Need Help?

- Run `chkd help` for command reference
- See `docs/CLI.md` for complete CLI documentation
- Run `chkd workflow` for the full development workflow
- Check the chkd UI at `http://localhost:3847`
