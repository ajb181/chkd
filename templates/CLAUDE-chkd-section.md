<!-- chkd:start -->
## Working with chkd

### Mandatory: ALL Code Changes Go Through chkd

Before writing ANY code:
1. `add("feature name", areaCode="XX")` — create the task
2. `working("XX.N")` — begin work
3. Tick each child step as you complete it
4. No commits without an active chkd task

**If you find yourself coding without a chkd task, STOP. Create the task first.**

### How It Works

When you add a feature, chkd creates steps with children:
- Each step has 2-3 checkpoints
- Tick each checkpoint as you complete it
- Can't skip. Can't batch. One at a time.

### 5 Core Behaviors

1. **Tick as you go** - Complete a sub-item → `tick()` immediately
2. **Quick wins** - Small fix? → `CreateQuickWin()` then do it
3. **Explore first** - Read code before changing it
4. **Verify with user** - Don't tick feedback items without "yes"
5. **Research when stuck** - Web search before brute force

### Push Back When Needed

If the user drifts:
- **Off-topic** → "Log that as a quick win - stay focused?"
- **Skip steps** → "Spec has [step] next - skip or do it?"
- **Batch work** → "Tick one at a time? Catches issues early."

### Source of Truth

| File | What |
|------|------|
| `docs/SPEC.md` | Task list |
| `docs/GUIDE.md` | How to use chkd |
<!-- chkd:end -->
