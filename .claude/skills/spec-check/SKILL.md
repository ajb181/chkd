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

```bash
curl -s "http://localhost:3847/api/spec/full?repoPath=$(pwd)" | jq
```

## Understanding Results

### Success Response
```json
{
  "success": true,
  "data": {
    "projectName": "Project Name",
    "phases": [...],
    "totalItems": 25,
    "completedItems": 10,
    "progress": 40
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "No docs/SPEC.md found"
}
```

## What to Check

| Issue | Description | Fix |
|-------|-------------|-----|
| Decimal phase numbers | `Phase 3.5` won't parse | Use integers only |
| Empty phases | Phases without `- [ ]` items | Add checklist items |
| Missing section numbers | Top-level items need `X.Y` format | Add `**1.1 Title**` |
| `####` headers | These are ignored by parser | Use checklist items instead |

## Quick Validation

After editing SPEC.md, run:

```bash
# Check if spec parses successfully
curl -s "http://localhost:3847/api/spec/full?repoPath=$(pwd)" | jq '.success'

# See progress summary
curl -s "http://localhost:3847/api/status?repoPath=$(pwd)" | jq
```

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

**All top-level items MUST have section numbers** in the format `PhaseNumber.SectionNumber`:

```markdown
### Phase 6: Live Development UI

> As a developer, I want to see my progress at a glance

- [x] **6.1 Command Center** - Central view for spec progress
  - [x] Spec progress bar
  - [x] Phase cards
- [ ] **6.2 Current Task Banner** - Show current task
  - [ ] Always visible task name
  - [ ] Time elapsed
- [ ] **6.3 Activity Feed** - What just happened
```

**Rules:**
- Section numbers are sequential within each phase (6.1, 6.2, 6.3...)
- Sub-items do NOT need section numbers
- When adding a new item, increment the last section number
- When inserting between items, renumber subsequent items
- This allows humans and AI to reference the same item (e.g., "Let's work on 6.3")

## Automated Check

Consider adding to your workflow:
1. Edit SPEC.md
2. Run `/spec-check`
3. Fix any issues
4. Commit

This ensures the spec always parses correctly.
