---
name: spec-check
description: Validate SPEC.md format - run after editing to catch parser issues
---

# /spec-check - Validate SPEC.md Format

**Purpose**: Validate that SPEC.md follows the correct format for the parser. Run this after editing SPEC.md to catch issues before they break things.

## When to Use

- After editing SPEC.md
- Before committing spec changes
- When phases are missing from status output
- When items aren't appearing correctly

## How to Run

Use `chkd_status` - this will show if the spec is parsing correctly and display progress.

## Understanding Results

### Success
You'll see phases, items, and progress percentages displayed correctly.

### Error
You'll see an error message about parsing issues.

## What to Check

| Issue | Description | Fix |
|-------|-------------|-----|
| Decimal phase numbers | `Phase 3.5` won't parse | Use integers only |
| Empty phases | Phases without `- [ ]` items | Add checklist items |
| Missing section numbers | Top-level items need `X.Y` format | Add `**1.1 Title**` |
| `####` headers | These are ignored by parser | Use checklist items instead |

## Fixing Common Issues

### "Phase has no checklist items"
The phase only has prose, code blocks, or headers. Convert to:
```markdown
- [ ] **6.1 Feature Name** - Description
  - [ ] Sub-task
```

### "Decimal phase number"
Change `### Phase 3.5: Name` to `### Phase 4: Name` (integers only)

### "#### headers are ignored"
Move content into the phase description or convert to checklist items.

## Section Numbering Format

**All top-level items MUST have section numbers** in the format `AreaCode.Number`:

```markdown
## Site Design

> Pages, layouts, user experience.

- [x] **SD.1 Command Center** - Central view for spec progress
  - [x] Spec progress bar
  - [x] Phase cards
- [ ] **SD.2 Current Task Banner** - Show current task
  - [ ] Always visible task name
  - [ ] Time elapsed
```

**Rules:**
- Section numbers are sequential within each area (SD.1, SD.2, SD.3...)
- Sub-items do NOT need section numbers
- When adding a new item, increment the last section number
- When inserting between items, renumber subsequent items
- This allows humans and AI to reference the same item (e.g., "Let's work on SD.3")

## Automated Check

Consider adding to your workflow:
1. Edit SPEC.md
2. Run `/spec-check` or `chkd_status`
3. Fix any issues
4. Commit

This ensures the spec always parses correctly.
