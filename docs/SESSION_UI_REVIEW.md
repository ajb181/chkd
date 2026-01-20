# chkd Development Retrospective - SD.8 Build Session

## Overview
Building SD.8 "Queue List for Off-Task Items" revealed significant gaps in Claude's knowledge of chkd tooling and workflow. This document captures what went wrong and suggests improvements.

---

## Knowledge Gaps

### 1. Didn't know the CLI existed
**Problem:** I was making raw curl calls to APIs instead of using the CLI helper.
**Discovery:** User had to tell me "We have a CLI helper running that you should be using"
**Impact:** Slower workflow, harder to remember endpoints

**CLI commands I should have known:**
```bash
chkd status              # See current task
chkd workflow            # Show dev workflow
chkd bug "description"   # Quick-create bug
chkd bugs                # List open bugs
```

**Root cause:** CLAUDE.md didn't prominently document CLI commands

### 2. Didn't know about `workingOn` API
**Problem:** Never signaled which sub-item I was working on
**Discovery:** User asked "should be calling the active task item as well"
**Impact:** UI couldn't show real-time progress during build

**Should have called:**
```bash
POST /api/session/working-on
{ "itemId": "...", "itemTitle": "..." }
```

### 3. Didn't tick sub-items as I worked
**Problem:** Built all 8 sub-items, only ticked parent at end
**Discovery:** User asked "why didn't you tick them as you went?"
**Impact:** Checklist showed 0/8 complete until manual fix

**Proper workflow:**
1. `workingOn(item)` - signal start
2. Build it
3. `tick(item)` - mark complete
4. Repeat

### 4. Didn't know tick needed item ID for children
**Problem:** Tried `tick("Queue input in task card")` - failed
**Discovery:** Had to debug and find that children need ID, not title query
**Impact:** Wasted time, couldn't tick sub-items easily

### 5. Didn't know about `[~]` in-progress marker
**Problem:** Tick failed on in-progress items
**Discovery:** Found `[~]` in spec file, tick only handled `[ ]`
**Impact:** Had to fix the writer code mid-session

---

## Documentation Gaps (CLAUDE.md)

### Missing or Unclear

| Topic | Issue |
|-------|-------|
| CLI commands | Buried, not prominent |
| `workingOn` API | Not documented at all |
| Tick workflow | No guidance on when/how to tick |
| Sub-item handling | No mention that children need ID |
| Spec markers | `[~]` for in-progress not explained |
| Session lifecycle | No clear start→working→tick→complete flow |

### Suggested CLAUDE.md Improvements

```markdown
## Build Workflow (CRITICAL)

When building a task with sub-items:

1. **Start session** (if not started)
   chkd start "SD.8"

2. **For each sub-item:**
   - Call workingOn: POST /api/session/working-on
   - Build it
   - Call tick: POST /api/spec/tick (use itemId for children!)

3. **Complete session**
   chkd done

## CLI Quick Reference
[Make this a prominent section, not buried]
```

---

## Tooling Weaknesses

### 1. Tick endpoint doesn't search children by title
**Current:** Only searches top-level items
**Needed:** Recursive search so `tick("sub-item title")` works
**Workaround:** Must use item ID

### 2. No CLI command for workingOn
**Current:** Must use raw API call
**Needed:** `chkd working "item title"` or automatic from tick

### 3. No CLI command for tick
**Current:** Must use API
**Needed:** `chkd tick "item"` or `chkd done "item"`

### 4. Tick doesn't handle in-progress `[~]` items
**Fixed in this session:** Updated regex `/\[[ ~]\]/`

### 5. No validation that Claude is following workflow
**Problem:** Nothing warned me I wasn't calling workingOn or ticking sub-items
**Needed:** Hooks or prompts that check workflow compliance

---

## Spec Format Issues

### Learned the hard way

| Issue | What happened |
|-------|---------------|
| `[~]` marker | Didn't know this existed, tick failed |
| Sub-item IDs | Different format than parent items |
| Section numbers | SD.1, SD.2 format - knew this but worth noting |

---

## Suggested Improvements

### For CLAUDE.md / Skills

1. **Prominent CLI section** at top with all commands
2. **Build workflow checklist** - step by step what to call
3. **Document workingOn API** - when and how to use
4. **Document tick requirements** - ID vs title, children handling
5. **Spec format reference** - `[ ]`, `[x]`, `[~]` markers explained

### For CLI

1. `chkd tick "item"` - tick by title (search children)
2. `chkd working "item"` - set current item
3. `chkd progress` - show current task's sub-items and status

### For /chkd Skill

1. **Auto-call workingOn** when starting each sub-item
2. **Auto-tick** when completing each sub-item
3. **Warn if not ticking** - "You completed work but didn't tick"
4. **Show checklist** at start of build session

### For API

1. Tick endpoint searches children recursively
2. Tick handles `[~]` markers (DONE)
3. workingOn clears when all items complete
4. Batch tick endpoint for multiple items

---

## Action Items

### Immediate (add to spec)
- [ ] Update CLAUDE.md with CLI commands prominently
- [ ] Document workingOn API and when to use it
- [ ] Document tick workflow for sub-items
- [ ] Add `chkd tick` CLI command

### Soon
- [ ] Fix tick endpoint to search children by title
- [ ] Add workflow validation to /chkd skill
- [ ] Auto-workingOn when building sub-items

### Later
- [ ] `chkd progress` command
- [ ] Workflow compliance warnings
- [ ] Batch operations
