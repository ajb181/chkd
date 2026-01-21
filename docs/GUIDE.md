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

**Option A: Use the CLI (recommended)**

```bash
# Add a feature with workflow sub-tasks
chkd add "Login page"

# Specify the area
chkd add "Auth API" --area BE

# Preview first
chkd add "Dashboard" --dry-run
```

This creates the feature with proper formatting and workflow sub-tasks (Explore, Design, Prototype, Feedback, Implement, Polish).

**Option B: Edit manually**

Edit `docs/SPEC.md` directly:

```markdown
# My Project

## Area: FE (Frontend)

- [ ] **FE.1 Login page** - Email/password form with validation
- [ ] **FE.2 Dashboard** - Show user stats and recent activity

## Area: BE (Backend)

- [ ] **BE.1 Auth API** - Login, logout, session management
```

**Task IDs:** The codes like `FE.1`, `BE.1` are task IDs. Use these to tell Claude what to build (e.g., `/chkd FE.1`).

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
2. Check status          →  chkd status
3. Start Claude Code     →  claude (in your project folder)
4. Build a task          →  /chkd SD.1 (use task ID from spec)
5. When done             →  /commit
6. Repeat                →  /chkd next-task-id
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
| `chkd add "title"` | Add a new feature/story to spec |
| `chkd edit "item"` | Update an item's title or story |
| `chkd bug "desc"` | Quick-create a bug |
| `chkd bugs` | List open bugs |
| `chkd win "title"` | Add a quick win |
| `chkd wins` | List quick wins |
| `chkd won "query"` | Complete a quick win |
| `chkd impromptu "desc"` | Start ad-hoc work (not in spec) |
| `chkd debug "desc"` | Start debug/investigation session |
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
| Add a new feature/story | `chkd add "Feature name"` |
| Update an item's description | `chkd edit "SD.1" --story "new desc"` |
| Plan or refine features | `/story` |
| Fix a bug | `/bugfix` |
| Quick-log a bug | `chkd bug "description"` |
| See open bugs | `chkd bugs` |
| Log a small improvement | `chkd win "quick fix idea"` |
| Complete a quick win | `chkd won "query"` |
| Do ad-hoc work (not in spec) | `chkd impromptu "what you're doing"` |
| Debug/investigate something | `chkd debug "what you're investigating"` |
| Commit your work | `/commit` |
| See overall progress | `chkd status` (in regular terminal) |
| Check the UI | Open `http://localhost:3847` |

---

## Adding Features from the CLI

Use `chkd add` to quickly add new features/stories to your spec.

### Basic Usage

```bash
# Add a feature (auto-detects area)
chkd add "User authentication"

# Add with a story/description
chkd add "Dark mode" --story "Toggle between light and dark themes"

# Specify the area
chkd add "Dark mode toggle" --area FE
chkd add "Rate limiting" --area BE

# Preview first (recommended)
chkd add "Payment integration" --dry-run
```

### What Gets Created

When you run `chkd add "User authentication"`, it creates:

```markdown
- [ ] **FE.4 User authentication**
  - [ ] Explore: research existing patterns
  - [ ] Design: plan approach + contracts
  - [ ] Prototype: build with mock data
  - [ ] Feedback: user reviews
  - [ ] Implement: real backend logic
  - [ ] Polish: error states, edge cases
```

### Custom Sub-tasks

```bash
# Use your own sub-tasks instead of the workflow
chkd add "API endpoint" --tasks "validation,tests,docs"
```

### Tips

- Use `--dry-run` to preview before adding
- Use `--story` to add context when creating
- The workflow sub-tasks (Explore, Design, etc.) enforce good practices
- Use `--no-workflow` if you just want the item without sub-tasks

### Updating Existing Items

Use `chkd edit` to update an item's title or story after creation:

```bash
# Update the story/description
chkd edit "SD.1" --story "New description for this feature"

# Update the title
chkd edit "FE.2" --title "Updated title"

# Update both
chkd edit "BE.1" --title "New name" --story "With new story"
```

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

## Development Tips

### Running a Stable Version

When developing chkd itself, hot reloads can interrupt your work. Run a stable build on a separate port:

```bash
# First time: Build and save a stable snapshot
npm run stable:build

# Then run stable on port 3848
npm run stable
```

**Two-step process:**
1. `stable:build` - Compiles current code and saves to `build-stable/` folder
2. `stable` - Runs the saved snapshot on port 3848

Use `http://localhost:3848` when you want a stable UI that won't reload while coding.

**Custom domain (optional):**
```bash
# Set up a friendly URL like http://chkd.com:3848
chkd hosts chkd.com

# See all options
chkd help hosts
```

> **Why two steps?** Development builds (`npm run build`) output to `build/`. If stable ran from that same folder, dev builds would overwrite your stable version mid-session. The separate `build-stable/` folder keeps them isolated.

### Form Persistence

Form inputs automatically save as you type and survive page reloads:

- **Bug input** - Quick bug capture field
- **Queue messages** - Messages for Claude
- **Feature capture** - Title, description, story, area, and wizard step

Drafts clear automatically when you submit. If you close the feature capture wizard accidentally, reopen it to get your draft back.

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

## The Workflow Philosophy

Every feature follows a 6-stage workflow designed to **get user feedback BEFORE investing in real implementation**.

### The 6 Stages

| Stage | Purpose | What Happens |
|-------|---------|--------------|
| **Explore** | Research first | Check existing code, understand the problem, find patterns |
| **Design** | Plan the approach | Define endpoint contracts, diagram if complex |
| **Prototype** | Build with mock data | UI + stubbed backend, iterate quickly |
| **Feedback** | User reviews | Get sign-off on UX before building real backend |
| **Implement** | Connect real logic | Replace mocks with actual implementation |
| **Polish** | Refine based on usage | Error states, edge cases, performance |

### Why This Matters

**The Feedback stage is critical.** By prototyping with mock data first:

- You can iterate on UX quickly without waiting for backend
- Users validate the approach before you invest in real implementation
- Frontend and backend can work in parallel (contract is defined)
- Less wasted work if the approach needs to change

### Example: Dashboard Feature

```markdown
- [ ] **FE.1 User Dashboard**
  - [ ] Explore: check existing dashboard patterns
  - [ ] Design: layout + data endpoint contracts
  - [ ] Prototype: dashboard UI with mock data
  - [ ] Feedback: user reviews dashboard UX
  - [ ] Implement: connect to real API endpoints
  - [ ] Polish: loading states, error handling
```

Notice how **Prototype** and **Feedback** happen before **Implement**. The user sees working UI (with fake data) and approves it. Only then do you build the real backend.

### For Frontend Features

1. Design with mock data + endpoint contract FIRST
2. Build UI that works with the mocks
3. Get user sign-off on the UX
4. THEN implement the real backend

### For Backend Features

1. Stub the endpoint with test data
2. Let frontend integrate against the stub
3. Get feedback on the API contract
4. THEN implement real logic

---

## Why chkd Works: Contextual AI Guidance

**The secret sauce:** chkd gives the AI small, contextual reminders at exactly the right moments.

### The Problem with AI Coding

AI assistants are powerful but can drift:
- Forget to log work → progress invisible
- Skip documentation → users confused
- Go off-plan → scope creep
- Miss patterns → inconsistent code

### The chkd Approach

Instead of one big instruction dump, chkd uses **micro-nudges** - small reminders that appear at decision points:

| When AI does... | chkd reminds... |
|-----------------|-----------------|
| `chkd add` (new feature) | "If user-facing, update docs" |
| `chkd also` (off-plan work) | "If affects users, update docs" |
| `chkd done` (incomplete items) | "Use pause if coming back later" |
| `chkd tick` (completes item) | Shows queued items from user |
| `chkd start` (begins task) | Shows handover notes from last session |

### Why This Works

1. **Right time, right place** - Reminders appear when relevant, not upfront
2. **Low friction** - Short nudges, not walls of text
3. **Builds habits** - Consistent prompts create consistent behavior
4. **Self-reinforcing** - Good practices become automatic

### It's Not Just for the AI

The same constraints that keep AI on track also help **users** develop better habits:

- **Spec-first thinking** - Forces you to plan before building
- **Breaking work into stages** - Explore → Design → Prototype → Feedback → Implement → Polish
- **Visible progress** - See what's done, what's next, what's blocked
- **Capturing off-plan work** - Nothing gets lost or forgotten
- **Handover notes** - Context survives between sessions

**This is especially valuable if you're new to software development.** You get healthy workflows built in, not bolted on. The structure that makes AI effective also teaches good practices.

### The Principle

> Don't rely on the AI remembering everything. Build guidance into the tool responses themselves.

> Constraints that improve AI output also improve human planning. Good structure benefits everyone.

This is why chkd isn't just a spec file - it's an interactive system that guides both human and AI through healthy development practices.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────┐
│                     YOU                              │
│                                                      │
│  1. Add features: chkd add "title" or edit SPEC.md  │
│  2. Run chkd status to see what's next              │
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

## Learnings & Gotchas

Things we've learned the hard way while building with chkd:

### Build folder isolation

**Problem:** Running `npm run build` during development overwrote the stable version, causing 500 errors on the stable UI.

**Cause:** Both dev builds and stable were using the same `build/` folder. When Claude tested changes with `npm run build`, it replaced the stable version mid-session.

**Solution:** Stable now uses a separate `build-stable/` folder. Use `npm run stable:build` to create a snapshot, then `npm run stable` to run it. Dev builds go to `build/` and don't touch stable.

**Lesson:** When running multiple environments (dev, stable, production), keep their build artifacts separate.

### Log off-plan work as you go

**Problem:** "Also did" list in UI was empty despite doing significant extra work.

**Cause:** Claude mentioned off-plan work in text responses but didn't use `chkd also` to log it to the system.

**Solution:** Use `chkd also "description"` immediately when doing off-plan work, not just at the end.

**Lesson:** The system only knows what you tell it. Logging as you go keeps the UI accurate.

### Keep documentation in sync

**Problem:** Features get built but documentation lags behind, leaving users confused.

**Cause:** Documentation updates are easy to forget when focused on code.

**Solution:** The CLI now reminds you:
- `chkd add` → "If this is user-facing, consider updating docs/GUIDE.md"
- `chkd also` → "If this affects users, update docs/GUIDE.md too"

**Lesson:** Build reminders into your tools. Don't rely on memory for important habits.

---

## Need Help?

- Run `chkd help` for command reference
- See `docs/CLI.md` for complete CLI documentation
- Run `chkd workflow` for the full development workflow
- Check the chkd UI at `http://localhost:3847`
