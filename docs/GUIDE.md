# chkd Development Guide

> How to build with chkd - plan in one place, build in another.

---

## How chkd Works

**One rule:** Plan in one place, build in another.

| Planning | | Building |
|----------|---|----------|
| **Where:** chkd UI | → | **Where:** Terminal |
| Browse stories | | Claude implements |
| Refine specs | | Stays on-plan |
| Pick what to do | | Marks complete |

**Why separate?** Planning = thinking, changing your mind. Building = executing, staying focused. Mixing them = scope creep.

---

## The Workflow

Every feature follows this flow:

```
EXPLORE → DESIGN → PROTOTYPE → FEEDBACK → IMPLEMENT → POLISH
```

### 1. EXPLORE
- Understand the problem space
- **Search for existing functions** that might already do this
- Validate the checklist items before starting
- Catch duplications HERE, not after code is written

### 2. DESIGN (if needed)
- Create flow diagram for complex data flows
- Before/after state diagrams
- Not every feature needs this - use judgment

### 3. PROTOTYPE
- **Build backend first** with test data
- Frontend calls real endpoints (not mock data in frontend)
- This forces you to see existing API patterns
- Test data becomes test fixtures later

### 4. FEEDBACK
- User reviews the working prototype
- Catch design issues before full implementation
- Refactoring happens here, before scope grows

### 5. IMPLEMENT
- Replace test data with real logic
- Frontend code shouldn't need to change

### 6. POLISH
- Add loading states, error handling
- Iterate based on actual usage

---

## The Development Flow

1. **Pick** - Select a story in chkd UI
2. **Refine** - Use `/story` to clarify specs (optional)
3. **Build** - Click "Start Building", Claude implements
4. **Review** - Check changes in Review tab
5. **Commit** - Commit with pre-filled message
6. **Repeat** - Pick next story

---

## Session Lifecycle

```
IDLE → BUILDING → TESTING → COMPLETE
         ↑          |
         └── rework ┘
```

| State | What's happening |
|-------|------------------|
| **IDLE** | No active task. Pick one from UI. |
| **BUILDING** | Claude is implementing. |
| **TESTING** | You review the changes. |
| **COMPLETE** | Done. Pick next task. |

---

## Available Skills

| Skill | When to use |
|-------|-------------|
| `/chkd` | Build current task, stay on-plan |
| `/story` | Plan, refine specs, add features |
| `/bugfix` | Fix bugs without feature creep |
| `/spec-check` | Validate SPEC.md format |

---

## CLI Commands

| Command | What it does |
|---------|--------------|
| `chkd status` | Show current task and progress |
| `chkd start <item>` | Begin working on a task |
| `chkd tick [item]` | Mark item complete |
| `chkd done` | Complete current task |
| `chkd check "idea"` | Check if idea is on-plan |
| `chkd add "feature"` | Add feature with workflow template |
| `chkd bug "problem"` | Log a bug for later |
| `chkd workflow` | Show the workflow diagram |

---

## Common Situations

| Situation | What to do |
|-----------|------------|
| "I have an idea" | `/story` or `/idea` |
| "Story needs work" | `/story` |
| "Ready to build" | Click Start Building → `/chkd` |
| "Found a bug" | Add as task, build normally |
| "Want to change scope" | Claude proposes, you approve |
| "I'm done" | Claude marks ready, you review |

---

## What Claude Does During Building

1. **Checks the session** - No task? Stops. Start one from UI.
2. **Reads the spec** - Understands what to build.
3. **Asks quick questions** - Layout? Interactions? States? Skips if spec is clear.
4. **Implements each item** - Signals progress → implements → marks complete.
5. **Marks ready for testing** - Shows summary, STOPS, waits for review.
6. **You review & iterate** - Review in UI → give feedback → Claude fixes → repeat.

**Iteration is expected.** First pass rarely perfect. Give feedback, Claude adjusts.

### Claude will NOT:
- Start work without a session
- Skip items (you do that in UI)
- Continue after "ready for testing"
- Change the spec without proposing

---

## Files That Matter

| File | Purpose |
|------|---------|
| `docs/SPEC.md` | Source of truth for features |
| `CLAUDE.md` | Project instructions for Claude |
| `.claude/skills/` | Skill definitions |

---

## When Things Go Wrong

**"Claude is doing something I didn't ask for"**
Say "stop". Check proposals in UI. It should propose changes, not make them.

**"Session shows wrong task"**
Complete or abandon it in UI, then start the right one.

**"Claude keeps asking what to work on"**
Start a task from chkd UI first. `/chkd` needs an active session.

**"Changes aren't showing in Review tab"**
Say "mark ready for testing" - Claude needs to call iteration-complete.

**"I want to skip an item"**
Mark it skipped in the UI, not in terminal.

---

## Polish Permission

> While implementing checklist items, Claude can add professional polish - loading states, error handling, micro-interactions - without needing explicit permission. These aren't scope changes, they're quality.

Examples of polish Claude should add:
- Loading spinners/skeletons
- Error states and recovery
- Empty states
- Hover effects
- Smooth transitions
- Input validation feedback
- Keyboard navigation
- Proper focus management

---

## Avoiding Duplication

> Before creating a new utility function, grep for similar patterns. If something close exists, extend it rather than duplicate.

Before writing new code:
```bash
# Search for similar patterns
grep -r "functionName" src/
grep -r "similar pattern" src/lib/
```

If something close exists:
1. Extend the existing function
2. Or refactor to share logic
3. Don't create a parallel implementation

---

## Quick Start

1. Start the server: `npm run dev`
2. Open UI: `http://localhost:3847`
3. Pick a task from the story list
4. Click "Start Building"
5. In terminal: run `/chkd`
6. Review when done, commit, repeat
