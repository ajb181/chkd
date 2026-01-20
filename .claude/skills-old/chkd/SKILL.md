---
name: chkd
description: Start building - check session, read spec, implement the current task
---

# /chkd - Build Mode

**Purpose**: Check the current task and BUILD IT. Read the spec, implement all items with professional quality.

---

## Core Philosophy

**Plan in one place (chkd CLI/UI), build in another (Claude Code).**

When `/chkd` is invoked, you're in BUILD mode. The planning is done. Execute.

---

## On Startup: Check Session

```bash
chkd status
```

### If no task (status: "idle"):
```
Tell the user:
> "No active task. Start one with `chkd start <item>` or tell me what to work on."
```

If they tell you what to work on, start the session:
```bash
chkd start "1.1"
```

### If task exists (status: "building"):
Continue. Read the spec section for that task and start building.

---

## The Workflow Steps

Each feature follows this flow. You'll see these as sub-items:

### 1. EXPLORE
- Understand the problem space
- **Search for existing functions** that might already do this
- **Read relevant codebase sections** to understand patterns
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

## 🎨 Polish Permission

> **While implementing checklist items, add professional polish - loading states, error handling, micro-interactions - without needing explicit permission. These aren't scope changes, they're quality.**

You can be creative on the "how" while staying on-plan for the "what".

Examples of polish you should add:
- Loading spinners/skeletons
- Error states and recovery
- Empty states
- Hover effects
- Smooth transitions
- Input validation feedback
- Keyboard navigation
- Proper focus management

---

## 🔍 Avoid Duplication

> **Before creating a new utility function, grep for similar patterns. If something close exists, extend it rather than duplicate.**

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

This is enforced by the EXPLORE step - you search before you build.

---

## The Build Loop

For each unchecked item in the task:

### 1. Implement it
Follow existing patterns. Add polish. Stay focused.

### 2. Mark it complete
```bash
chkd tick "1.1"
```

### 3. Move to next item
Repeat until all items done.

**Don't stop after each item. Keep building.**

---

## Spec Changes Via CLI

**Use the CLI** for spec changes:

| Action | Command |
|--------|---------|
| Check status | `chkd status` |
| Start task | `chkd start "1.1"` |
| Mark complete | `chkd tick "1.1"` |
| Complete task | `chkd done` |
| Check if on-plan | `chkd check "idea"` |
| Add feature | `chkd add "feature name"` |
| Log bug | `chkd bug "problem"` |
| Show workflow | `chkd workflow` |

---

## When Done: Complete the Task

```bash
chkd done
```

Then tell the user:
> "Task complete! Run `chkd status` to see what's next."

---

## Handling Off-Plan Requests

### User asks for something not in the spec

First, check if it's on-plan:
```bash
chkd check "what user asked for"
```

If off-plan, offer options:
1. **Add to spec** - `chkd add "feature name"`
2. **Log for later** - `chkd bug "issue description"`
3. **Quick fix** - If tiny, just do it and mention it

---

## Backend-First Development

When building features with both backend and frontend:

1. **Design the API first** - What endpoints? What data shape?
2. **Build backend with test data** - Return hardcoded responses
3. **Build frontend calling real endpoints** - Not mock data in frontend
4. **Replace test data with real logic** - Frontend doesn't change

This approach:
- Catches API design issues early
- Forces you to see existing patterns
- Keeps frontend code stable
- Test data becomes test fixtures

---

## Quick Reference

```bash
chkd status              # Check current state
chkd start "1.1"         # Start working on item
chkd tick "1.1"          # Mark item complete
chkd done                # Complete current task
chkd check "idea"        # Check if on-plan
chkd add "feature"       # Add new feature (with workflow template)
chkd bug "problem"       # Log a bug for later
chkd workflow            # Show the development workflow
chkd help                # Show all commands
```

---

## Rules

### DO:
- Check status on startup
- Search for existing code before writing new
- Add professional polish (loading, errors, etc.)
- Follow the workflow steps (Explore → Design → Prototype → Feedback → Implement → Polish)
- Build backend first with test data
- Mark items complete as you go
- Stay on-plan, or ask first

### DON'T:
- Start work without checking status
- Duplicate existing functionality
- Skip the Explore step
- Build frontend with mock data (use real endpoints with test data)
- Add features without checking if on-plan
- Stop after every item (keep building)

---

## Server Not Running?

If commands fail:
> "Can't connect to chkd. Run `npm run dev` in the chkd-v2 directory first."
