# UI Redesign Spec

## Problem Statement

The current UI is confusing:
- "BUILDING" badge means nothing without context
- Checkboxes suggest manual ticking (wrong mental model)
- No clear sense of what's done vs not done
- No guidance on how to use the tool
- Toggle behavior is broken

## Success Criteria

- User can capture ideas FAST (priority #1)
- User can see what's being built and progress in real-time
- User can approve/pass completed features
- User can manage priorities and skip items
- Claude's terminal work syncs to UI in real-time

---

## Core Concepts

### The UI is a human interface to SPEC.md
- Not a separate database
- Done items stay in spec for context
- All changes write to the spec file

### Claude reads files, writes through API
- Claude reads SPEC.md, skills, etc. directly (normal behavior)
- Claude writes via API endpoints
- This gives us: control, consistency, event hooks, future automation

### Two levels of completion
1. **Item level**: Claude auto-ticks as it builds (Open → In Progress → Done)
2. **Story level**: User approves the whole feature when satisfied

---

## Item States

```
Open → In Progress → Done
         ↓
       Skipped
```

- **Open**: Not started
- **In Progress**: Claude is working on this now
- **Done**: Claude completed it
- **Skipped**: User marked to skip this cycle

User cannot manually tick items. User CAN skip items.

---

## Story/Feature Lifecycle

```
Capture → Organise → Build → Review → Approve
                       ↑        ↓
                       └── Rework ←┘
```

- **Capture**: Quick add in UI (title only minimum)
- **Organise**: Assign area, set priority (list order)
- **Build**: Terminal session (Claude works, ticks items)
- **Review**: User tests, checks code, verifies criteria
- **Approve**: User clicks approve button
- **Rework**: If issues found, back to build

---

## UI Views

### Main View: Feature List

Grouped by area (Site Design, Frontend, Backend, etc.)
- Expand/collapse areas
- Each feature shows: title + story + checklist + progress
- List order = priority (drag to reorder)
- Filter by: area, status, text search
- Show all incomplete items easily

### When Building (Session Active)

Show prominently:
- Which story is being built
- Current checklist item being worked on
- Progress bar (e.g., "3/8 items")
- Real-time updates as Claude ticks items

### Feature Detail

- Full story (user story + description + acceptance criteria)
- Checklist with item states
- Rich editor to edit story
- Skip button for items
- Approve button (when all items done)

### Add Feature (Speed is Priority #1)

Minimal required: just title
- AI helps flesh out story
- Auto-adds workflow template:
  - [ ] Explore
  - [ ] Design
  - [ ] Prototype
  - [ ] Feedback
  - [ ] Implement
  - [ ] Polish
- Plus feature-specific items
- Can edit before starting

---

## Actions in UI

| Action | Where |
|--------|-------|
| Add feature | Quick capture, title only |
| Edit story | Rich editor in feature detail |
| Reorder priority | Drag in list |
| Skip item | Button on item |
| Approve feature | Button when all items done |
| Filter/search | Top of list |

**NOT in UI:**
- Start session (terminal only)
- Tick items (Claude does this)
- Edit code
- Git operations (future)

---

## API Endpoints Needed

### For Claude (write operations):

| Endpoint | Purpose |
|----------|---------|
| `POST /api/session/working-on` | Signal current item |
| `POST /api/spec/item/complete` | Mark item done |
| `POST /api/spec/item/in-progress` | Mark item in progress |
| `POST /api/session/iteration-complete` | Ready for testing |
| `POST /api/session/capture-for-later` | Capture ideas/bugs |

### For UI:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/spec/full` | Get full spec (exists) |
| `POST /api/spec/add` | Add feature (exists) |
| `POST /api/spec/skip` | Skip an item |
| `POST /api/spec/approve` | Approve a feature |
| `POST /api/spec/reorder` | Change priority order |
| `PUT /api/spec/story` | Update story text |
| `GET /api/session` | Get current session (exists) |

### Real-time:

| Mechanism | Purpose |
|-----------|---------|
| WebSocket or SSE | Push updates to UI when Claude ticks items |

---

## Side Effects on Write

When Claude calls an API to change something:
1. Update SPEC.md file
2. Log the event (history)
3. Notify UI (real-time update)
4. (Future) Trigger hooks (run tests, etc.)

---

## Bug Tracking

Uses /bugfix skill workflow:
- Bugs captured via `POST /api/session/capture-for-later` with type="bug"
- Shown in UI as separate list
- Not blocking, but visible

---

## Multiple Projects

- UI can switch between repos
- Each repo has its own spec
- Session is per-repo

---

## Out of Scope (v1)

- Git operations (commits, branches, merges)
- Code editing
- Test running
- Mobile optimization (nice to have, not critical)

---

## Visual Design Principles

- Clarity over beauty
- Speed of capture is #1
- Show what's happening NOW prominently
- Done items stay visible (for context) but de-emphasized
- Real-time feels alive

---

## Open Questions

1. How to handle items with no story yet? (Just title)
2. Should areas be configurable or fixed?
3. What does "Explore" step look like in practice?

---

*Spec created via /interview on 2026-01-20*
*Questions asked: ~25*
