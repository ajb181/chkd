# chkd of chkd - Tooling Retrospective

## Summary
Using chkd to build chkd revealed gaps in documentation, CLI tooling, and workflow guidance. This document captures what Claude didn't know and what needs fixing.

---

## Knowledge Gaps

### 1. CLI Commands Unknown
**What happened:** Made raw curl calls to APIs instead of using CLI
**User had to say:** "We have a CLI helper running that you should be using"

**Commands I didn't know existed:**
```bash
chkd status
chkd workflow
chkd bug "description"
chkd bugs
chkd help
```

**Why:** CLAUDE.md had CLI section but it wasn't prominent enough to stick

---

### 2. workingOn API Unknown
**What happened:** Never signaled which sub-item I was working on
**User had to say:** "should be calling the active task item as well"

**API exists but wasn't documented:**
```
POST /api/session/working-on
{ "repoPath": "...", "itemId": "...", "itemTitle": "..." }
```

**Why:** Not in CLAUDE.md, not in skill instructions

---

### 3. Tick Workflow Unknown
**What happened:** Built 8 sub-items, only ticked parent at end
**User had to say:** "why didn't you tick them as you went?"

**Correct workflow:**
1. workingOn(item) → signal start
2. Build it
3. tick(item) → mark complete
4. Move to next

**Why:** No workflow documentation, just endpoint docs

---

### 4. Sub-item Tick Requirements Unknown
**What happened:** `tick("Queue input in task card")` failed
**Had to discover:** Children require item ID, not title query

**Why:** Tick endpoint doesn't search children, no docs about this limitation

---

### 5. Spec Markers Unknown
**What happened:** Tick failed on `[~]` in-progress items
**Had to discover:** Spec uses `[~]` for in-progress, tick only handled `[ ]`

**Spec markers:**
- `[ ]` - open
- `[x]` - complete
- `[~]` - in-progress

**Why:** Not documented anywhere

---

## Documentation Problems

### CLAUDE.md Issues

| What's Missing | Impact |
|----------------|--------|
| CLI commands at top | Didn't know they existed |
| workingOn API | Never called it |
| Tick workflow | Only ticked at end |
| Sub-item handling | Couldn't tick children |
| Spec markers | Code broke on `[~]` |
| Session lifecycle | No start→work→tick→done flow |

### Skill Instructions Issues

**/chkd skill** doesn't specify:
- Call workingOn for each sub-item
- Tick sub-items as you complete them
- How to tick children (need ID)

---

## CLI Gaps

### Missing Commands

| Need | Current State |
|------|---------------|
| `chkd tick "item"` | Must use API |
| `chkd working "item"` | Must use API |
| `chkd progress` | No way to see sub-item status |

### Existing Commands Not Prominent
```bash
chkd status    # Good but didn't know about it
chkd workflow  # Good but didn't know about it
```

---

## API Gaps

### Tick Endpoint Limitations
1. Doesn't search children by title
2. Didn't handle `[~]` markers (fixed)
3. Returns empty title for children

### Session Endpoint Limitations
1. currentItem doesn't auto-clear when complete
2. No sub-item progress in response

---

## Spec Format Issues

### Undocumented
- `[~]` in-progress marker
- Sub-item ID format (different from parents)
- How workingOn relates to `[~]` marker

---

## Recommendations

### 1. Update CLAUDE.md

**Add prominent "Quick Start" section:**
```markdown
## Quick Start (READ THIS FIRST)

### Check status
chkd status

### Building a task
For EACH sub-item:
1. chkd working "item title"
2. Build it
3. chkd tick "item title"

### When done
chkd done
```

### 2. Add CLI Commands
```bash
chkd tick "item"      # Tick by title (search children)
chkd working "item"   # Set current item
chkd progress         # Show current task checklist
```

### 3. Update /chkd Skill

Add to instructions:
```markdown
## For each sub-item:
1. Call: chkd working "sub-item title"
2. Build it
3. Call: chkd tick "sub-item title"
DO NOT batch - tick as you go!
```

### 4. Fix Tick Endpoint
- Search children recursively
- Handle `[~]` markers (DONE)
- Return proper title for children

### 5. Document Spec Format
```markdown
## Spec Markers
- [ ] Open item
- [x] Complete item
- [~] In-progress item (set by workingOn)
```

---

## Action Items

### Must Fix (blocking effective use)
- [x] CLI: Add `chkd tick` command ✅ DONE
- [x] CLI: Add `chkd working` command ✅ DONE
- [x] Docs: Workflow section in CLAUDE.md ✅ DONE
- [x] Docs: Spec markers reference ✅ DONE
- [x] API: Tick searches children ✅ DONE

### Should Fix (friction)
- [x] Skill: Add tick-as-you-go instructions ✅ DONE
- [x] Skill: Add workingOn instructions ✅ DONE
- [x] CLI: Add `chkd progress` command ✅ DONE

### Nice to Have
- [ ] Auto-workingOn when tick starts
- [ ] Warn if building without workingOn
- [ ] Session shows sub-item progress

---

## Resolution Summary (2026-01-20)

All "Must Fix" and "Should Fix" items have been implemented:

### New CLI Commands
```bash
chkd tick "item"      # Mark item complete (searches children)
chkd working "item"   # Signal working on item
chkd progress         # Show current task's sub-items
```

### Updated Documentation
- CLAUDE.md: Added spec markers, sub-item workflow
- GUIDE.md: Added spec markers, workflow section, all skills
- /chkd skill: Complete rewrite with tick-as-you-go workflow

### API Fixes
- Tick endpoint now searches children recursively by title
