<!-- chkd:start -->
## Working with chkd

### Mandatory: Start Every Session Right

**Step 1:** `status()` — see what's happening
**Step 2:** `working("XX.N")` — start your task (this gives you checkpoints, design file, requirements)
**Step 3:** Follow the checkpoints. Tick as you go.

**If no task exists yet:**
- Feature? → Write design to `docs/designs/`, then `add(title, areaCode, designFile)`
- Small fix? → `CreateQuickWin(title, files, test)`
- Bug? → `CreateBug(title, reproduce, files, expected)`

**If you find yourself coding without calling `working()` first, STOP.**

### How It Works

When you add a feature, chkd creates steps with children:
- Each step has 2-3 checkpoints
- Tick each checkpoint as you complete it
- Can't skip. Can't batch. One at a time.

### 5 Core Behaviors

1. **Tick as you go** - Complete a checkpoint → `tick()` immediately
2. **Quick wins** - Small fix? → `CreateQuickWin()` then do it
3. **Explore first** - Read code before changing it
4. **Verify with user** - Don't tick feedback items without "yes"
5. **Research when stuck** - Web search before brute force

### Push Back When Needed

If the user drifts:
- **Off-topic** → "Log that as a quick win - stay focused?"
- **Skip steps** → "Spec has [step] next - skip or do it?"
- **Batch work** → "Tick one at a time? Catches issues early."

### File Organization

When creating docs, plans, or notes:
- **Design files** → `docs/designs/` (then moved to `docs/{ITEM.ID}/design.md` by chkd)
- **Task-specific files** → `docs/{ITEM.ID}/` (e.g., `docs/BE.48/notes.md`)
- **Plans** → `docs/plans/`
- **Research** → `docs/research/`

See `docs/FILING.md` for full naming conventions.

### Source of Truth

| Source | What |
|--------|------|
| Database | Task list (via MCP tools) |
| `docs/GUIDE.md` | How to use chkd |
| `docs/FILING.md` | File organization rules |
| `docs/AGENT-GOVERNANCE.md` | Agent behavior rules |

### Key MCP Tools

| Tool | When |
|------|------|
| `status()` | First thing every session |
| `working("XX.N")` | Before writing ANY code — gives you the full plan |
| `tick("item")` | After completing each checkpoint |
| `add(title, areaCode, designFile)` | New feature (design file required) |
| `CreateQuickWin(title, files, test)` | Small fix, no design needed |
| `CreateBug(title, reproduce, files, expected)` | Bug report |



## TL;DR

chkd keeps you focused. Tick work as you go. Push back if the user drifts.

---

## Philosophy

**The problem:** Humans want AI to run at 100mph. AI wants to comply. Both skip steps.

**The solution:** chkd is a collaboration contract. Neither party can skip checkpoints.

```
Tick → Verify → Tick → Verify
```

At each checkpoint: you show what you did, user confirms or redirects, then next step. The tool enforces this for both parties.

**Simple statement:** chkd slows both human and AI to the speed of good work.

→ Full philosophy: [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md)

---

## You Can Push Back

The constraint applies to BOTH parties. If the user drifts:

- **Off-topic request** → "Log that with CreateQuickWin() - stay focused?"
- **Wants to skip steps** → "Spec has [step] next - skip or do it?"
- **Wants to batch** → "Tick one at a time? Catches issues early."

You're enforcing the contract both signed up for.

<!-- chkd:end -->
