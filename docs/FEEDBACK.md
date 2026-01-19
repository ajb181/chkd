# chkd v2 Feedback & Improvements

> Detailed feedback from review session. Work through these items.

---

## Summary

**Overall**: Strong foundation for spec/workflow management. But missing core features from original vision.

**Key Gap**: v2 focuses on spec management and workflow. Original chkd v1 had **test generation** and **quality validation** features that are NOT in v2.

**Priority order**:
1. Fix SPEC.md sync (shows wrong status)
2. Decide: Is v2 just workflow, or does it need original features?
3. Spec structure decision (areas vs phases)
4. Testing story
5. UI (optional but nice)

---

## 0. Original Core Features - Missing from v2 🔴

**The original chkd v1 vision included**:

### Test Generation (Phase 1 - was WORKING in v1)
```
- [x] Git repo watching (detect commits on branch)
- [x] Diff analysis (extract changed files)
- [x] Function extraction (find added/modified functions)
- [x] Test generation (call Claude API)
- [x] Learn mode (WHY THIS TEST MATTERS explanations)
- [x] Impact analysis (import graph, affected files)
- [x] Test writing (persist to codebase)
```

**NOT in v2**. This was the original "quality control" feature - automatically generating tests when you commit.

### Sceptic Check (was planned, not fully built)
```
Before writing any code, validate the idea:
- What problem are we solving?
- Do existing tools solve this?
- Cost/benefit analysis
- Decision: BUILD / USE EXISTING / ABANDON
```

**NOT in v2**. This was meant to prevent wasted effort.

### Quality Gates (was planned)
```
Before merge to main:
- All spec items complete
- All standards followed
- All tests passing
- Documentation updated
```

**NOT in v2**. This was meant to block bad code from reaching main.

### Teaching Philosophy
```
"Explain, Don't Just Block"
- "This would delete 500 user records. Here's the safe way..." ✓
- Every guardrail is a teaching moment
- WHY rules exist, not just enforces them
```

**Partially in v2** - CLI has `chkd workflow` that teaches, but the deep explanations aren't there.

---

### Decision Needed: What is v2?

**Option A: v2 is just workflow management**
- Spec tracking, session management, CLI
- Test generation and quality gates come later (or never)
- Keep it simple

**Option B: v2 should have core quality features**
- Port test generation from v1
- Add sceptic check
- Add quality gates
- More complex but more complete

**Option C: v2 is foundation, v3 adds quality**
- v2 = workflow + spec management (current)
- v3 = add test generation
- v4 = add sceptic + quality gates

**Recommendation**: Start with Option A (keep v2 simple), but document the full vision so it's not lost.

---

## 1. SPEC.md Sync Issue 🔴

**Problem**: The SPEC.md shows items as incomplete that are actually done.

```markdown
# Current SPEC.md shows:
- [ ] **1.2 Database Layer** - SQLite for repos, sessions, bugs
- [ ] **1.3 Spec Parser** - Parse SPEC.md into structured data
- [ ] **1.4 Spec Writer** - Modify SPEC.md

# But BUILD_PLAN.md says:
✅ Database layer (src/lib/server/db/)
✅ Spec parser (src/lib/server/spec/parser.ts)
✅ Spec writer (src/lib/server/spec/writer.ts)
```

**Action**: Update SPEC.md to reflect actual state. Mark completed items with `[x]`.

**Files to check**:
- `src/lib/server/db/index.ts` - Does database work?
- `src/lib/server/db/queries.ts` - Are queries implemented?
- `src/lib/server/spec/parser.ts` - Does parser work?
- `src/lib/server/spec/writer.ts` - Does writer work?

If they work, mark them done in SPEC.md.

---

## 2. Spec Structure: Areas vs Phases 🟡

**Current**: SPEC.md uses phases (Phase 1, Phase 2, etc.) - temporal organization.

**Vision**: Organize by areas (Site Design, Frontend, Backend) - spatial organization.

**The idea**:
```
## Site Design
   - Pages, layouts, wireframes

## Frontend
   - Components, stores, state management

## Backend
   - APIs, services, database

## Future Areas
   - Planned features not yet started

## Reference
   - Standards, format rules
```

**The flow**:
```
Future Areas (roadmap)
       ↓
    Build it
       ↓
Move to where it lives (Site Design / Frontend / Backend)
```

**Why this matters**:
- Spec reflects reality (what exists where)
- Easy to find things ("Where's the session API?" → Backend)
- No stale "Phase 1 ✅" that nobody looks at
- Roadmap is clearly separate from current state

**Decision needed**: Do we restructure SPEC.md now, or keep phases for v2?

**Reference**: See `/Users/alex/chkd/docs/SPEC_v2_DEMO.md` for a demo of this structure.

---

## 3. Testing Story 🟡

**Status**: Not addressed yet. Was in "To Discuss" parking lot.

**Questions to answer**:
1. What kind of tests does chkd need? (unit, integration, e2e?)
2. Should chkd generate tests for itself?
3. How does testing fit the workflow template?
4. When in the workflow do tests get written? (Implement phase? Polish phase?)

**Suggested approach**:
- Keep it simple initially
- Maybe just API endpoint tests
- Can expand later

**Action**: Decide on testing approach and add to spec.

---

## 4. Debugging Skill 🟢

**Vision** (from V2_WORKFLOW_VISION.md):
```
Make debugging more formal:
1. Open debug session - Load skill, create debug file
2. Write as you go - Document findings in the debug file
3. Close with learnings - Capture what was learned
4. Update overview - Check if we need to prevent same mistake
```

**Current**: `/bugfix` skill exists but doesn't have the formal session/learnings capture.

**Action**:
- Review current `/bugfix` skill
- Decide if we want the formal debugging session approach
- If yes, update the skill or create separate `/debug` skill

**Priority**: Low - current `/bugfix` probably works fine for now.

---

## 5. UI Components 🟢

**BUILD_PLAN.md says**: UI is optional, CLI is primary interface.

**If you want UI**, copy from old project:
```
/Users/alex/chkd/src/lib/components/
├── StoryList.svelte
├── StoryDetail.svelte
├── CurrentTaskCard.svelte
```

**Considerations**:
- Old components may have dependencies on old API shape
- May need adaptation for new `/api/*` routes
- Start with just status display, add interactivity later

**Action**: Defer unless specifically requested.

---

## 6. Workflow Template Verification ✅

**Vision**: Every feature added via `chkd add` gets workflow steps auto-populated.

**Status**: ✅ Implemented - SPEC.md shows "Dark Mode Support" with:
```
- [ ] Explore: understand problem, search existing functions
- [ ] Design: flow diagram if needed
- [ ] Prototype: backend with test data + frontend calling it
- [ ] Feedback: user reviews prototype
- [ ] Implement: replace test data with real logic
- [ ] Polish: iterate based on usage
```

**Verified working**.

---

## 7. Skills Review ✅

All skills exist and have correct content:

| Skill | Status | Notes |
|-------|--------|-------|
| `/chkd` | ✅ Good | Has polish permission, avoid duplication, workflow steps |
| `/bugfix` | ✅ Exists | Research-first approach |
| `/story` | ✅ Exists | Story development |
| `/spec-check` | ✅ Exists | Format validation |

**No action needed** on skills.

---

## 8. CLI Review ✅

CLI is clean and well-documented:

| Command | Status |
|---------|--------|
| `chkd status` | ✅ Works |
| `chkd start <item>` | ✅ Works |
| `chkd tick [item]` | ✅ Works |
| `chkd done` | ✅ Works |
| `chkd check "idea"` | ✅ Works |
| `chkd add "feature"` | ✅ Works |
| `chkd bug "problem"` | ✅ Works |
| `chkd workflow` | ✅ Works - shows full workflow diagram |
| `chkd help` | ✅ Works |

**No action needed** on CLI.

---

## 9. Minor Polish Items 🟢

From BUILD_PLAN.md "Phase 4: Polish":
- ~~Fix emoji duplication bug~~ ✅ Fixed
- [ ] Better elapsed time display in CLI
- [ ] Error handling improvements

**Action**: Address when time permits.

---

## Action Summary

### Must Do (Before Using)
1. **Fix SPEC.md** - Mark completed items as `[x]`

### Should Decide
2. **Spec structure** - Areas vs phases? (Recommend: try areas)
3. **Testing approach** - What tests? When in workflow?

### Nice to Have
4. **Debugging skill** - Formal session approach
5. **UI** - Visual progress display
6. **CLI polish** - Elapsed time, error handling

---

## Files Reference

| Purpose | Location |
|---------|----------|
| This feedback | `docs/FEEDBACK.md` |
| Build plan | `docs/BUILD_PLAN.md` |
| Vision doc | `docs/V2_WORKFLOW_VISION.md` |
| Spec | `docs/SPEC.md` |
| Old project | `/Users/alex/chkd/` |
| Demo spec structure | `/Users/alex/chkd/docs/SPEC_v2_DEMO.md` |

---

## How to Use This Doc

1. Start with "Must Do" section
2. Make decisions on "Should Decide" items
3. Work through "Nice to Have" as time permits
4. Update this doc as items are completed
