# Design: Final Review Gate

> Stories can't be closed directly by CLI. They go to Final Review where user decides.

---

## Problem

Currently Claude can tick a story complete and it's done. No human verification that:
- All sub-tasks are actually finished
- Quality is acceptable
- Nothing was missed
- It's ready to ship

---

## Solution: Final Review Queue

### The Flow

```
OPEN (working) → READY FOR REVIEW → USER DECIDES:
                                      ├─ ✓ Done (close it)
                                      ├─ + Add tasks (reopen, more work needed)
                                      └─ ↺ Reopen (not now, work on later)
```

### CLI Behavior Change

**Before:**
```bash
chkd tick "SD.1"  # → Story is DONE
```

**After:**
```bash
chkd tick "SD.1"  # → Story is READY FOR REVIEW (not done yet)
```

CLI can no longer directly close a story. It can only mark sub-items complete.
When the parent story is ticked, it moves to Final Review.

---

## UI Changes

### 1. Final Review Section

New section above Priority groups, or as a tab/icon on the area page.

**Location options:**
- A) Above P1 in the main list (most visible)
- B) Icon/badge on area header that opens a review panel
- C) Separate "Review" tab alongside the work list

**Recommendation:** Option A - inline above P1, always visible when items need review.

### 2. Review Card Design

```
┌─────────────────────────────────────────────────┐
│ 🔍 READY FOR REVIEW                              │
├─────────────────────────────────────────────────┤
│ SD.11 Repository Cards Navigation Strip         │
│ ────────────────────────────────────────────    │
│ ✓ Explore: check existing repo selector         │
│ ✓ Design: card layout and info display          │
│ ✓ Prototype: cards with mock repo data          │
│ ✓ Feedback: user reviews card UX                │
│ ✓ Implement: connect to real repo list          │
│ ✓ Polish: active states and transitions         │
│                                                 │
│ Time spent: 2h 34m                              │
│ Completed: 10 mins ago                          │
│                                                 │
│ [✓ Done]  [+ Add Tasks]  [↺ Reopen Later]      │
└─────────────────────────────────────────────────┘
```

### 3. Actions

**✓ Done**
- Marks story as complete `[x]`
- Moves to completed section
- Records completion timestamp

**+ Add Tasks**
- Opens dialog to add new sub-tasks
- Story stays in review or moves back to appropriate priority
- Status becomes in-progress again

**↺ Reopen Later**
- Moves story back to backlog/chosen priority
- Clears "ready for review" status
- Optional: add note about why

---

## Data Model Changes

### New Status Value

```typescript
type ItemStatus = 'pending' | 'in_progress' | 'ready_for_review' | 'complete';
```

### Spec Marker

New marker for ready-for-review:
```markdown
- [?] **SD.11 Feature Name** - Ready for review
```

Or reuse existing with metadata in session/db.

**Recommendation:** Use `[?]` marker - visible in spec, clear meaning.

---

## API Changes

### `POST /api/spec/tick`

When ticking a parent story (not sub-item):
- If all sub-items complete → set status to `ready_for_review`
- Return message: "Marked for review. User will verify."

### `POST /api/spec/review` (new)

```typescript
{
  repoPath: string;
  itemId: string;
  action: 'approve' | 'add_tasks' | 'reopen';
  tasks?: string[];  // if adding tasks
  priority?: number; // if reopening
  note?: string;     // optional note
}
```

---

## CLI Changes

### `chkd tick` on parent story

```
$ chkd tick "SD.11"

  📋 Marked for review: SD.11 Repository Cards

  All sub-items complete. User will verify in UI.

  💡 User actions in UI:
     - ✓ Done (approve and close)
     - + Add tasks (needs more work)
     - ↺ Reopen later
```

### New command: `chkd review` (optional)

Show what's pending review:
```
$ chkd review

  📋 Ready for Review (2 items)

  SD.11 Repository Cards Navigation Strip
        Completed: 10 mins ago

  BE.3  User Preferences API
        Completed: 2 hours ago

  💡 Review these in the UI to approve or request changes.
```

---

## Session Handling

When story moves to review:
- Session can end (`chkd done`)
- Or continue with next task

Story in review doesn't block other work.

---

## Edge Cases

### 1. Story has no sub-items
Still goes to review. User can add tasks or approve.

### 2. User adds tasks during review
- New tasks added to story
- Story moves back to in-progress
- Priority set by user (or keeps current)

### 3. Partial sub-items complete
Can't tick parent until all sub-items done.
(Current behavior, unchanged)

### 4. CLI tries to force-complete
Not allowed. CLI can only mark for review.
User must approve in UI.

---

## Migration

Existing completed items stay completed.
New completions go through review flow.

---

## Summary

| What | Before | After |
|------|--------|-------|
| CLI ticks story | Done immediately | Marked for review |
| Who closes stories | Claude (CLI) | User (UI only) |
| Quality gate | None | User reviews all completions |
| Reopen flow | Manual edit | Built-in UI action |

---

## Open Questions

1. Should there be a way to bypass review for trivial items?
2. Notification when items are ready for review?
3. Batch review (approve multiple at once)?

---

## Implementation Order

1. Add `ready_for_review` status to types
2. Add `[?]` marker support to parser/writer
3. Update `tick` endpoint for parent stories
4. Add Review section to UI
5. Add review actions (done/add/reopen)
6. Update CLI messaging
7. Optional: `chkd review` command
