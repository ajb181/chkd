---
name: chkd
description: Build a specific task from the spec
args: task_id
---

# /chkd <task_id> - Build Mode

**Usage:** `/chkd SD.1` - builds task SD.1 from the spec

---

## On Startup (Do these in order!)

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

Use `chkd_status` to see sub-items and their status.

### 4. Start the session

Use `chkd_working("SD.1")` to register the task as active.

### 5. Tell the user what you're building

> "Building **SD.1: [Task Title]**"

---

## The Sub-Item Workflow (IMPORTANT!)

**For tasks with sub-items, tick as you go. Don't batch at the end!**

### Understanding the phases

When you see these sub-items, here's what they mean:

| Sub-item starts with | What to do |
|---------------------|------------|
| **Explore:** | Research only. Read code, find patterns. **Flag complexity to user.** Share findings before continuing. |
| **Design:** | Plan the approach. Define contracts. Show user, iterate if needed. |
| **Prototype:** | Build with FAKE/MOCK data. Stub the backend. Verify against spec/wireframe. |
| **Feedback:** | ⚠️ STOP. Show user. Get explicit approval. One approval ≠ blanket approval. |
| **Implement:** | NOW build real backend. Only after Feedback approval. Verify it works. |
| **Polish:** | Error states, loading, edge cases. Verify edge cases handled. |
| **Document:** | Update docs, guides, CLAUDE.md if user-facing feature. Confirm docs match implementation. |
| **Commit:** | Commit code to git with clear message + assumptions noted. |

**Critical:** Prototype ≠ Implement. Prototype uses mock data so the user can approve the UX before you invest in real backend code.

**Each phase has a checkpoint** where you share/verify with the user before moving on. Neither human nor AI can skip these.

### Explore Phase: Investigate First!

During Explore, before proposing any changes:

1. **Review the code you'll touch** - Read it, understand it
2. **Flag complexity** - If code is messy or complex, tell the user:
   - "This area could use refactoring first"
   - "This file is 500+ lines, might want to split"
3. **Let user decide** - They choose whether to refactor first or proceed
4. **If refactoring:** Create a refactor story first → do that → return

Don't dive into changes without understanding what you're touching.
Don't add features on top of messy code without flagging it.

### For EACH sub-item:

```
1. Signal you're starting   → chkd_working("sub-item title")
2. BUILD IT                 → Actually do the work!
3. Mark it complete         → chkd_tick("sub-item title")
```

**⛔ NEVER batch:** The system enforces a 2-second minimum between working and tick. This ensures you actually do the work, not just announce intentions.

### Example:

```
Task: SD.3 User Authentication
Sub-items:
- [ ] Login form validation
- [ ] Password reset flow
- [ ] Remember me functionality
```

```
chkd_working("Login form validation")
... build login validation ...
chkd_tick("Login form validation")

chkd_working("Password reset flow")
... build password reset ...
chkd_tick("Password reset flow")
```

### Why tick as you go?

1. Progress is visible in real-time
2. User knows exactly where you are
3. If interrupted, work isn't lost
4. Spec stays accurate

---

## While Building

### Follow the SPEC's sub-items, not your own plan

The spec has sub-items for a reason. Follow them in order:

```
- [ ] Explore: ...    ← Do this first
- [ ] Design: ...     ← Then this
- [ ] Prototype: ...  ← Then this
- [ ] Feedback: ...   ← STOP and get approval
- [ ] Implement: ...  ← Only after approval
- [ ] Polish: ...     ← Error states, edge cases
- [ ] Document: ...   ← Update docs if needed
- [ ] Commit: ...     ← Commit with assumptions
```

**Don't** create your own todo list or implementation plan. The spec IS the plan.

### Off-plan work → Log it

If you do something not explicitly in the current task, use `chkd_also("description")`:
- Fixed a bug you discovered
- Updated related code
- Added error handling elsewhere

### Notice a bug?

Use `chkd_bug("description")` - don't fix it now unless it blocks your task.

### Feedback sub-items → Pause for user

When you reach a sub-item like "Feedback: user reviews..." - STOP and ask:

> "Prototype ready for review. Does this approach work for you?"

Don't proceed to "Implement" until user approves.

**Important: One approval ≠ blanket approval**

- Approval for the login form doesn't mean approval for the signup form
- Each distinct UI/feature needs its own feedback cycle
- If user says "looks good", that's approval for THIS prototype only
- When in doubt, check in again before building more

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

After all sub-items are ticked, use `chkd_tick("SD.1")`.

### End the session

Use `chkd_done()` when finished.

### Tell the user

> "Done with **SD.1: [Task Title]**
>
> Completed sub-items:
> - [x] Login form validation
> - [x] Password reset flow
> - [x] Remember me functionality
>
> Also did:
> - [thing 1]
> - [thing 2]

---

## Spec Markers

The spec uses these markers:
- `[ ]` - Not started
- `[~]` - In progress (set by working)
- `[x]` - Complete (set by tick)

---

## Rules

### DO:
- Signal when starting each sub-item
- **Tick sub-items as you complete them**
- Log off-plan work
- Pause at "Feedback" sub-items for user approval
- Add polish (loading, errors, etc.)
- End the session when finished

### DON'T:
- Work on wrong task
- **Batch all ticks at the end**
- Skip the Feedback pause
- **Tick Feedback items without explicit user approval** (user must say "yes"/"approved"/etc.)
- **Treat one approval as blanket approval** (each feature needs its own feedback)
- Add features without logging
- Forget to mark complete
- **Ignore CLAUDE.md** - if you're not following chkd rules, re-read CLAUDE.md and respect ALL instructions
