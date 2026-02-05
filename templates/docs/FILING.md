# Document Filing Guide

Rules for organizing docs so they're findable later.

---

## Folder Structure

```
docs/
├── GUIDE.md             # Workflow guide (synced by chkd)
├── PHILOSOPHY.md        # Why chkd exists (synced by chkd)
├── FILING.md            # This file (synced by chkd)
├── AGENT-GOVERNANCE.md  # Agent behavior rules
├── {AREA}.{NUM}/        # Task-specific folders (e.g., BE.48/, FE.23/)
├── designs/             # Design & architecture docs
├── plans/               # Implementation plans
├── handovers/           # Session context for continuity
├── stories/             # User stories & requirements
├── research/            # Investigation & research notes
├── epics/               # Epic definitions
├── archive/             # Old/unused files
└── attachments/         # File attachments
```

**Task-specific folders** (NEW):
- `docs/BE.48/` - All files related to task BE.48
- `docs/FE.23/` - All files related to task FE.23
- Use this for notes, research, screenshots specific to one task

Note: Spec items and quick wins are stored in the database, not markdown files.
Use `status()` to see current items.

---

## Naming Convention

```
[context]-descriptive-name.md
```

**Context prefix** (use the most relevant one):

| Prefix | When to use | Example |
|--------|-------------|---------|
| Epic tag | Doc relates to an epic | `auth-overhaul-token-refresh.md` |
| Spec item | Doc relates to a spec item | `FE.3-component-structure.md` |
| Date | Time-sensitive (handovers) | `2025-01-26-session-context.md` |
| None | General/standalone | `caching-strategies.md` |

---

## Rules

1. **Always use kebab-case** - `my-design-doc.md` not `MyDesignDoc.md`
2. **Be descriptive** - `auth-token-refresh-flow.md` not `auth-stuff.md`
3. **Handovers get dates** - Always prefix with `YYYY-MM-DD-`
4. **Link to epic/item when relevant** - Helps find related docs later
5. **Create folders if missing** - `mkdir -p docs/designs` before writing

---

## Examples

| Type | File Path |
|------|-----------|
| Design for epic | `docs/designs/auth-overhaul-login-flow.md` |
| Design for item | `docs/designs/FE.3-dashboard-layout.md` |
| Plan for item | `docs/plans/BE.5-api-migration.md` |
| Handover | `docs/handovers/2025-01-26-auth-work.md` |
| Research | `docs/research/react-state-patterns.md` |
| Story | `docs/stories/SD.12-user-onboarding.md` |
| General design | `docs/designs/caching-strategy.md` |

---

## When Creating Docs

Before writing a new doc:

1. **Pick the right folder** based on doc type
2. **Check for existing docs** - might be able to update instead
3. **Use the naming convention** - context prefix + descriptive name
4. **Create the folder** if it doesn't exist

```bash
# Example: creating a design doc for epic "auth-overhaul"
mkdir -p docs/designs
# Then write to docs/designs/auth-overhaul-session-management.md
```
