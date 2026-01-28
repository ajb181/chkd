# SD.26 Background: Redefine Impromptu Sessions

## The Incident

Claude was asked to fix 5 bugs/quick wins. Instead of using the proper per-item workflows:

```
bugfix("bug 1") → fix → commit
bugfix("bug 2") → fix → commit
won("quick win 1") → commit
```

Claude did:

```
impromptu("Fixing 5 bugs/quick wins") → fixed everything → single commit
```

Result: All work batched into one commit, no per-feature isolation.

## Root Cause Analysis

**The tools exist:**
- `bugfix()` → `fix()` → `resolve()` → commit (for bugs)
- `working()` → `tick()` → commit (for spec items)
- `won()` → commit (for quick wins)

**But Claude defaulted to impromptu** because:
1. It felt like "ad-hoc work" (fixing multiple small things)
2. Impromptu has no structure - easy to batch
3. No guidance saying "don't batch discrete items in impromptu"

## The Problem With Impromptu

Currently impromptu is undefined. It's used for:
- Truly ad-hoc single tasks (correct)
- Batching multiple discrete items (incorrect)
- Research/exploration (should be `debug()`?)
- Planning sessions (should be separate?)

Without clear boundaries, Claude defaults to impromptu for everything that "isn't a spec item."

## Design Questions

1. **What IS impromptu for?**
   - Single ad-hoc task not in spec?
   - Quick exploration before deciding on approach?
   - User request that doesn't fit other categories?

2. **What is impromptu NOT for?**
   - Multiple bugs (use bugfix per bug)
   - Multiple quick wins (use won per win)
   - Work that should be tracked discretely

3. **How to enforce/guide?**
   - Conscience guidance: "For bugs use bugfix(), for wins use won()"
   - Detect patterns: impromptu description with "5 bugs" → suggest breaking out
   - Limit scope: impromptu = single task, not a container for batching

4. **Commit expectations?**
   - Impromptu should still end with commit prompt?
   - Or is impromptu so lightweight it doesn't need commits?

## Proposed Direction

**Impromptu = single ad-hoc task**

- One thing, not tracked in spec
- Expected to be short (< 30 min?)
- Commit at end is optional (user's call)

**If multiple discrete items → use proper workflows**

- Bugs → `bugfix()` per bug
- Quick wins → `won()` per win
- Spec items → `working()`/`tick()` per item

**Detection/nudging:**

- If impromptu description mentions multiples, suggest breaking out
- Conscience guidance updated with clear examples
- CLAUDE.md updated with "impromptu is for X, not for Y"

## User's Input

> "I don't want to be too hardcore because the user is responsible as well"
> "commit per story, commit per bug, commit per discrete piece of work"
> "quick wins already have it"
> "the issue was how it was pulled out - stayed in impromptu"

User wants soft guidance, not hard enforcement. The user shares responsibility.
