# chkd Development Guide

> Keep Claude on-plan. Track what gets built.

---

## What is chkd?

chkd helps you build software with Claude Code without losing control:

1. **Spec-driven** - Your features live in `docs/SPEC.md`
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

### 2. Configure MCP in Claude Code

Add to your Claude Code MCP settings (`~/.claude/claude_desktop_config.json` or via Claude Code settings):

```json
{
  "mcpServers": {
    "chkd": {
      "command": "npx",
      "args": ["tsx", "/Users/YOUR_USERNAME/chkd/src/mcp/server-http.ts"]
    }
  }
}
```

Restart Claude Code after adding.

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

## MCP Tools (Preferred)

When the MCP server is connected, Claude has these tools:

| Tool | What it does |
|------|--------------|
| `status` | See current state - **run this first!** |
| `working "item"` | Signal starting work on an item |
| `tick "item"` | Mark item complete |
| `suggest` | Get suggestion for what to work on next |
| `bug "desc"` | Log a bug without derailing |
| `bugfix "bug"` | Start working on a bug |
| `fix "bug"` | Signal fix ready for verification |
| `resolve "bug"` | Close bug after user verified |
| `win "title"` | Add a quick win |
| `wins` | List quick wins |
| `won "query"` | Mark quick win done |
| `impromptu "desc"` | Start ad-hoc work session |
| `debug "desc"` | Start investigation session |
| `done` | End current session |
| `pulse "status"` | Quick status update |
| `checkin` | 15-minute check-in |
| `attach` | Attach file to bug/quickwin/item |

**Resources** (Claude reads these for context):
- `chkd://conscience` - Session state, guidance, habits
- `chkd://spec` - Current spec with progress

---

## CLI Commands (Fallback)

Use these when MCP isn't connected:

```bash
# Status
chkd status              # See progress and current task
chkd list                # List all spec items

# Building
chkd working "item"      # Signal starting work
chkd tick "item"         # Mark complete

# Features
chkd add "title"         # Add feature with sub-tasks
chkd add "title" --area BE --story "description"

# Bugs
chkd bug "description"   # Quick-create a bug
chkd bugs                # List open bugs
chkd bugfix "bug"        # Start bugfix
chkd fix "bug"           # Signal fix ready
chkd resolve "bug"       # Close after verified

# Quick Wins
chkd win "title"         # Add quick win
chkd wins                # List quick wins
chkd won "query"         # Mark done

# Sessions
chkd impromptu "desc"    # Start ad-hoc work
chkd debug "desc"        # Start debug session
chkd done                # End session
```

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
| `docs/SPEC.md` | Feature checklist (source of truth) |
| `docs/GUIDE.md` | This guide |
| `docs/QUICKWINS.md` | Small improvements to do later |
| `docs/attachments/` | File attachments for bugs/items |
| `CLAUDE.md` | Instructions for Claude |
| `.claude/skills/` | Build skills |

---

## Troubleshooting

**"chkd: command not found"**
```bash
cd ~/chkd && sudo npm link
```

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

- `chkd help` - Command reference
- `chkd help <command>` - Detailed help
- UI: `http://localhost:3847`
