---
name: chkd
description: Build a specific task from the spec
args: task_id
---

# /chkd <task_id> - Build Mode

**Usage:** `/chkd SD.1` - builds task SD.1 from the spec

---

## On Startup

### 1. Parse the task ID

The user runs `/chkd SD.1` - extract "SD.1" as the task ID.

Task IDs use area codes:
- `SD.1` = Site Design, item 1
- `FE.3` = Frontend, item 3
- `BE.2` = Backend, item 2

If no task ID provided:
> "Which task? Run `/chkd <id>` - e.g., `/chkd SD.1`"

### 2. Look up the task in SPEC.md

Read `docs/SPEC.md` and find the task matching the ID.

If task not found:
> "Task SD.1 not found in spec. Check `docs/SPEC.md` for valid task IDs."

### 3. Check current progress

```bash
chkd progress
```

This shows sub-items and their status if the task has any.

### 4. Start building

Tell the user what you're building:
> "Building **SD.1: [Task Title]**"

---

## The Sub-Item Workflow (IMPORTANT!)

**For tasks with sub-items, tick as you go. Don't batch at the end!**

### For EACH sub-item:

```bash
# 1. Signal you're starting
chkd working "sub-item title"

# 2. Build it
# ... do the work ...

# 3. Mark it complete immediately
chkd tick "sub-item title"
```

### Example:

```
Task: SD.3 User Authentication
Sub-items:
- [ ] Login form validation
- [ ] Password reset flow
- [ ] Remember me functionality
- [ ] Session timeout handling
```

```bash
chkd working "Login form validation"
# ... build login validation ...
chkd tick "Login form validation"

chkd working "Password reset flow"
# ... build password reset ...
chkd tick "Password reset flow"

# ... and so on for each sub-item
```

### Why tick as you go?

1. Progress is visible in real-time
2. User knows exactly where you are
3. If interrupted, work isn't lost
4. Spec stays accurate

---

## While Building

### Stay focused on the task

Build what's in the spec for this task. Follow the checklist items.

### Off-plan work → "Also did" list

If you do something not explicitly in the current task:
1. Note it
2. Tell the user: "Also did: [thing]"
3. Keep going

Examples of "also did":
- Fixed a bug you discovered
- Updated related code
- Added error handling elsewhere

### Notice a bug?

```bash
chkd bug "description of the bug"
```

Don't fix it now unless it blocks your task.

### Polish is allowed

You can add professional polish without asking:
- Loading states
- Error handling
- Empty states
- Hover effects
- Keyboard navigation

This isn't off-plan, it's quality.

---

## When Done

### Mark the parent task complete

After all sub-items are ticked:

```bash
chkd tick "SD.1"
```

### Tell the user

> "Done with **SD.1: [Task Title]**
>
> Completed sub-items:
> - [x] Login form validation
> - [x] Password reset flow
> - [x] Remember me functionality
> - [x] Session timeout handling
>
> Also did:
> - [thing 1]
> - [thing 2]
>
> Run `chkd status` to see what's next."

---

## Quick Reference

```bash
# Status & Progress
chkd status          # See overall progress
chkd progress        # See current task's sub-items

# During work
chkd working "item"  # Signal you're starting an item
chkd tick "item"     # Mark item complete

# Issues
chkd bug "problem"   # Log a bug for later
chkd bugs            # See open bugs
```

---

## Spec Markers

The spec uses these markers:
- `[ ]` - Not started
- `[~]` - In progress (set by `chkd working`)
- `[x]` - Complete (set by `chkd tick`)

---

## Rules

### DO:
- Build the specified task
- **Tick sub-items as you complete them**
- Use `chkd working` before starting each sub-item
- Note off-plan work as "Also did"
- Add polish (loading, errors, etc.)
- Search for existing code before writing new

### DON'T:
- Work on wrong task
- **Batch all ticks at the end**
- Add features without noting them
- Skip sub-items
- Forget to mark complete
