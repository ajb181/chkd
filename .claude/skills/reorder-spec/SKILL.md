---
name: reorder-spec
description: Organize and clean up SPEC.md - works on empty templates or messy specs
---

# /reorder-spec - Organize Your Spec

**Purpose**: Clean up, organize, and properly format SPEC.md. Works on:
- Empty templates (interviews you to populate)
- Messy specs with dumped-in tasks
- Existing specs that need reorganization

## When to Use

- After `chkd upgrade` to populate the template
- After dumping tasks into the spec quickly
- When items are in wrong areas
- When numbering is off
- When you want a clean, organized spec

## Key Principles

1. **Conservative by default** - Don't over-generate tasks
2. **Confirm before adding** - Ask user before adding new items
3. **Check existing tracking** - Look for TODO.md, ROADMAP.md, issues, etc.
4. **Lightweight** - Better to have fewer items user can add to

## Instructions for Claude

When the user runs `/reorder-spec`:

### Step 1: Check for existing tracking

Look for existing task lists the user might have:

```bash
ls -la TODO.md ROADMAP.md TASKS.md docs/TODO.md docs/ROADMAP.md 2>/dev/null
```

Also check for:
- GitHub/GitLab issues (ask user)
- Comments with TODO/FIXME in code
- Any other tracking system they mention

If found, ask: "I found [X]. Want me to import tasks from there?"

### Step 2: Read the spec

```bash
cat docs/SPEC.md
```

Analyze the content:
- Is it empty/template? (has placeholder text like "[First Page]")
- Does it have real content that needs organizing?
- What areas exist?

### Step 3A: If empty/template - Interview (Minimal)

Ask the user:
1. "What does this project do? (1-2 sentences)"
2. "What are the 3-5 main features that EXIST right now?"

**DO NOT** generate speculative future tasks. Only document what exists.

After user responds, ask:
"Want me to add 2-3 'next up' items? If so, what's the priority?"

### Step 3B: If has content - Organize Only

1. Parse all items (completed and incomplete)
2. Group by logical area:
   - **Site Design (SD)**: Pages, layouts, navigation, UX
   - **Frontend (FE)**: Components, state, client logic
   - **Backend (BE)**: APIs, services, database, server
   - **Future (FUT)**: Planned features, ideas
3. Renumber sequentially within each area
4. Preserve completion status `[x]` vs `[ ]`
5. Remove exact duplicates
6. Keep sub-items with their parent

**DO NOT** add new items when organizing. Only reorganize what's there.

If the spec looks thin, ask:
"The spec has X items. Want me to suggest a few additions based on [existing tracking/codebase]?"

### Step 4: Confirm before writing

Before writing the spec, show the user:
- Summary of what will change
- Any new items being added (with their approval)
- Items being moved between areas

Ask: "Look good? Should I write this?"

### Step 5: Write the organized spec

Use this format:

```markdown
# Project Name Specification

> Brief project description

---

## Site Design

> Pages, layouts, user experience.

- [ ] **SD.1 Feature Name** - Description
  - [ ] Sub-task
  - [ ] Another sub-task
- [x] **SD.2 Completed Feature** - Already done

---

## Frontend

> Components, state management, client-side logic.

- [ ] **FE.1 Component Name** - Description

---

## Backend

> APIs, services, database, server logic.

- [ ] **BE.1 Endpoint Name** - Description

---

## Future

> Planned features and ideas for later.

- [ ] **FUT.1 Future Idea** - Description

---

## Reference

### Workflow Template

Every feature added gets these steps:
```
- [ ] Explore: understand problem, search existing functions
- [ ] Design: flow diagram if needed
- [ ] Prototype: backend with test data + frontend calling it
- [ ] Feedback: user reviews prototype
- [ ] Implement: replace test data with real logic
- [ ] Polish: iterate based on usage
```

### Spec Format

- Area header: `## Area Name`
- Section numbers: `**XX.N Feature Name**` (e.g., BE.1, FE.2)
- Checklist: `- [ ]` or `- [x]`
- User story: Blockquote `>`

---

*Spec organized with /reorder-spec*
```

### Step 4: Validate

Run `chkd status` to verify the spec parses correctly.

## Example Transformations

### Before (messy dump)
```markdown
## stuff
- add login
- [ ] dashboard thing
- fix the api bug
- BE.1 user endpoint
- maybe add dark mode later
```

### After (organized)
```markdown
## Site Design

- [ ] **SD.1 Dashboard** - Dashboard thing

---

## Backend

- [ ] **BE.1 User Endpoint** - User endpoint
- [ ] **BE.2 API Bug Fix** - Fix the api bug

---

## Frontend

- [ ] **FE.1 Login Page** - Add login

---

## Future

- [ ] **FUT.1 Dark Mode** - Maybe add dark mode later
```

## Tips

- Run after quickly dumping ideas into the spec
- Safe to run multiple times
- Always preserves your content, just reorganizes
- Creates backup if making major changes
